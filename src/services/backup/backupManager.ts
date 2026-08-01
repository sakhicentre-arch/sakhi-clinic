/**
 * backupManager.ts
 * Sakhi Clinic — Backup Engine: orchestrator.
 *
 * The only file that wires all the layers together:
 *
 *   Backup Manager (this file)
 *           |
 *   Backup Planner        -- should this run, and what kind?
 *           |
 *   Backup Serializer      -- build the bundle + metadata, JSON-encode it
 *           |
 *   Encryption Layer       -- pass-through today (see encryptionLayer.ts)
 *           |
 *   Compression Layer      -- real gzip, backward-compatible
 *           |
 *   Integrity Validator    -- shape check + checksum
 *           |
 *   Storage Provider       -- local by default; Google Drive is a wired-in
 *                              but non-functional stub pending OAuth
 *
 * This is the ONLY file that knows about the envelope format wrapping a
 * compressed/encrypted payload. Every layer above only knows its own
 * input/output shape -- none of them know which storage provider is being
 * used, and the storage provider doesn't know anything about compression,
 * encryption, or backup content.
 */

import { planAutoBackup, planManualBackup } from "./backupPlanner";
import { serializeBackup, parseBackupJson, planRestore, deserializeAndRestore, makeBackupFilename } from "./backupSerializer";
import { encrypt, decrypt } from "./encryptionLayer";
import { compress, decompress } from "./compressionLayer";
import { validateBundleShape, computeChecksum, verifyChecksum } from "./integrityValidator";
import { localBackupProvider } from "./providers/localBackupProvider";
import type { StorageProvider } from "./storageProvider";
import { recordBackupSuccessDetails, recordRestoreSuccess } from "../storageHealthService";
import { logOperationalEvent } from "../operationalEventLogService";

const ENVELOPE_VERSION = 1;

type BackupEnvelope = {
  sakhiBackupEnvelope: typeof ENVELOPE_VERSION;
  compressed: boolean;
  encrypted: boolean;
  checksum?: string;
  payload: string;
};

function isEnvelope(parsed: any): parsed is BackupEnvelope {
  return Boolean(parsed) && typeof parsed === "object" && parsed.sakhiBackupEnvelope === ENVELOPE_VERSION;
}

async function buildEnvelope(json: string): Promise<{ envelopeJson: string; sizeBytes: number }> {
  const encryptionResult = await encrypt(json);
  const compressionResult = await compress(encryptionResult.content);

  let checksum: string | undefined;
  try {
    checksum = await computeChecksum(compressionResult.content);
  } catch {
    // Checksum is a defense-in-depth extra, never a requirement -- an
    // envelope without one just skips the corruption check on import.
    checksum = undefined;
  }

  const envelope: BackupEnvelope = {
    sakhiBackupEnvelope: ENVELOPE_VERSION,
    compressed: compressionResult.compressed,
    encrypted: encryptionResult.encrypted,
    checksum,
    payload: compressionResult.content,
  };
  const envelopeJson = JSON.stringify(envelope);
  return { envelopeJson, sizeBytes: new Blob([envelopeJson]).size };
}

/**
 * Runs the full export pipeline against a given provider (local by
 * default) and returns whether it succeeded. Both the doctor-initiated
 * export and the silent auto-backup call this -- they differ only in
 * `silent` and whether a plan gate applies first.
 */
async function runExportPipeline(input: { silent: boolean; reasonForLog: string; eventType: string }): Promise<void> {
  const { file, json } = await serializeBackup();

  const shapeCheck = await validateBundleShape(file.data.bundle);
  if (!shapeCheck.ok) {
    throw new Error(shapeCheck.error || "Backup validation failed before it was saved");
  }

  const { envelopeJson, sizeBytes } = await buildEnvelope(json);

  const exportedAtDate = new Date(file.metadata.exportedAt);
  const filename = makeBackupFilename(Number.isFinite(exportedAtDate.getTime()) ? exportedAtDate : new Date());

  const provider: StorageProvider = localBackupProvider; // Phase 3: selectable once a second provider is real
  const saveResult = await provider.save({ filename, content: envelopeJson, contentType: "application/json", silent: input.silent });
  if (provider.prune) await provider.prune(5);

  if (!saveResult.ok) {
    throw new Error(saveResult.error || "Could not save backup");
  }

  recordBackupSuccessDetails({
    exportedAtIso: file.metadata.exportedAt,
    sizeBytes,
    counts: file.metadata.totals,
  });

  await logOperationalEvent({
    level: "info",
    type: input.eventType,
    message: input.reasonForLog,
    data: { exportedAt: file.metadata.exportedAt, schemaVersion: file.metadata.schemaVersion, totals: file.metadata.totals, provider: provider.id },
  }).catch(() => {});
}

export async function runExport(): Promise<void> {
  try {
    await logOperationalEvent({ level: "info", type: "backup.export.start", message: "Backup export started" });
    planManualBackup(); // always shouldRun; kept for a consistent Plan-shaped audit trail
    await runExportPipeline({ silent: false, reasonForLog: "Backup export completed", eventType: "backup.export.success" });
  } catch (error) {
    console.error("[backupManager] runExport failed:", error);
    await logOperationalEvent({
      level: "error",
      type: "backup.export.failure",
      message: "Backup export failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    alert("Clinic backup could not be created. Please retry.");
  }
}

export async function runAutoIfDue(input?: { reason?: string; minHoursBetweenBackups?: number }): Promise<void> {
  try {
    const plan = planAutoBackup({ minHoursBetweenBackups: input?.minHoursBetweenBackups });
    if (!plan.shouldRun) return;

    await runExportPipeline({
      silent: true,
      reasonForLog: "Automatic local backup snapshot created",
      eventType: "backup.auto.success",
    });
  } catch (error) {
    await logOperationalEvent({
      level: "warn",
      type: "backup.auto.failure",
      message: "Automatic backup snapshot failed",
      data: { reason: input?.reason || "auto", error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
  }
}

export async function runImport(file: File): Promise<void> {
  try {
    await logOperationalEvent({
      level: "info",
      type: "backup.import.start",
      message: "Backup import started",
      data: { filename: file.name, size: file.size },
    });

    const text = await file.text();
    const parsed: any = JSON.parse(text);

    let bundleLike: any;
    if (isEnvelope(parsed)) {
      if (parsed.checksum) {
        const checksumOk = await verifyChecksum(parsed.payload, parsed.checksum);
        if (!checksumOk) throw new Error("Backup file failed integrity check (checksum mismatch) -- it may be corrupted.");
      }
      const decompressed = await decompress(parsed.payload, parsed.compressed);
      const decrypted = await decrypt(decompressed, parsed.encrypted);
      bundleLike = parseBackupJson(decrypted).bundleLike;
    } else {
      // Legacy / plain-JSON backup (new-but-uncompressed metadata-wrapped,
      // or the pre-envelope V1/V2 formats) -- unchanged path.
      bundleLike = parseBackupJson(text).bundleLike;
    }

    const plan = planRestore(bundleLike, "overwrite");
    const exportedAt = String(bundleLike?.exportedAt || "");
    const deviceId = String(bundleLike?.deviceId || "");
    const patientsCount = plan.incoming.patients ?? 0;
    const consultationsCount = plan.incoming.consultations ?? 0;

    const confirmRestore = window.confirm(
      [
        "Restore clinic backup?",
        "",
        `Exported: ${exportedAt || "Unknown date"}`,
        `Device: ${deviceId || "Unknown device"}`,
        `Patients: ${patientsCount}`,
        `Consultations: ${consultationsCount}`,
        "",
        "This will overwrite ALL existing clinic data on this device.",
        "Continue?",
      ].join("\n")
    );
    if (!confirmRestore) return;

    await deserializeAndRestore(bundleLike, "overwrite");
    await logOperationalEvent({
      level: "info",
      type: "backup.import.success",
      message: "Backup import completed",
      data: { filename: file.name },
    });
    recordRestoreSuccess(new Date().toISOString());
    alert("Clinic backup restored.");
  } catch (error) {
    console.error("[backupManager] runImport failed:", error);
    await logOperationalEvent({
      level: "error",
      type: "backup.import.failure",
      message: "Backup import failed",
      data: { filename: file.name, error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    alert("Restore failed. The backup file looks invalid or incomplete.");
  }
}

export async function getLocalSnapshotSummary(): Promise<{ count: number; filenames: string[] }> {
  const items = (await localBackupProvider.list?.()) || [];
  return { count: items.length, filenames: items.map((i) => i.filename).sort() };
}
