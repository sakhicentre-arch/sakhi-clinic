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
 * compressed/encrypted payload, AND the only file (besides
 * backupJobService.ts itself) that knows BackupJob exists. Every layer
 * above only knows its own input/output shape -- none of them know which
 * storage provider is being used, the storage provider doesn't know
 * anything about compression/encryption/backup content, and NEITHER of
 * them knows a job is being tracked. A future real GoogleDriveProvider
 * plugs into the exact same pipeline: it reports progress via the plain
 * onProgress callback StorageProvider already defines, and this file is
 * solely responsible for turning that into BackupJob events.
 *
 * Provider selection is a runtime value (getActiveProvider/setActiveProvider
 * below), not a hardcoded import used directly in the pipeline -- so
 * swapping local storage for a real, connected Google Drive provider later
 * (Phase 3's Settings UI calling setActiveProvider once OAuth succeeds) is
 * a single function call from outside this file, not a source edit here.
 * Every function in this file calls getActiveProvider() and nothing else;
 * none of them can drift into assuming which concrete provider is active.
 */

import { planAutoBackup, planManualBackup } from "./backupPlanner";
import { serializeBackup, parseBackupJson, planRestore, deserializeAndRestore, makeBackupFilename } from "./backupSerializer";
import { encrypt, decrypt } from "./encryptionLayer";
import { compress, decompress } from "./compressionLayer";
import { validateBundleShape, computeChecksum, verifyChecksum } from "./integrityValidator";
import { localBackupProvider } from "./providers/localBackupProvider";
import type { StorageProvider } from "./storageProvider";
import { createJob, recordEvent, completeJob, failJob, cancelJob } from "./backupJobService";
import type { BackupJobKind } from "../db";
import { recordBackupSuccessDetails, recordRestoreSuccess } from "../storageHealthService";
import { logOperationalEvent } from "../operationalEventLogService";

let activeProvider: StorageProvider = localBackupProvider;

/** The provider every pipeline function below actually uses. */
export function getActiveProvider(): StorageProvider {
  return activeProvider;
}

/** Phase 3: called once a real provider (e.g. a connected Google Drive) is ready to take over. */
export function setActiveProvider(provider: StorageProvider): void {
  activeProvider = provider;
}

export function resetActiveProviderToLocal(): void {
  activeProvider = localBackupProvider;
}

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

/**
 * Runs the full export pipeline against the active provider, tracked as a
 * BackupJob end to end. Both the doctor-initiated export and the silent
 * auto-backup call this -- they differ only in `silent`, job `kind`, and
 * whether a plan gate applies first.
 */
async function runExportPipeline(input: { kind: BackupJobKind; silent: boolean; reasonForLog: string; eventType: string }): Promise<void> {
  const provider = getActiveProvider();
  const job = await createJob(input.kind, provider.id);

  try {
    await recordEvent(job.id, "planning", "Planning backup");

    const { file, json } = await serializeBackup();
    await recordEvent(job.id, "serializing", "Serialized clinic data bundle", { data: { totals: file.metadata.totals } });

    const shapeCheck = await validateBundleShape(file.data.bundle);
    if (!shapeCheck.ok) {
      throw new Error(shapeCheck.error || "Backup validation failed before it was saved");
    }
    await recordEvent(job.id, "validating", "Validated bundle shape");

    const encryptionResult = await encrypt(json);
    await recordEvent(
      job.id,
      "encrypting",
      encryptionResult.encrypted ? "Encrypted backup" : "Encryption not yet implemented in this build -- stored as-is"
    );

    const compressionResult = await compress(encryptionResult.content);
    await recordEvent(
      job.id,
      "compressing",
      compressionResult.compressed ? "Compressed backup" : "Compression unavailable in this browser -- stored uncompressed"
    );

    let checksum: string | undefined;
    try {
      checksum = await computeChecksum(compressionResult.content);
    } catch {
      // Checksum is defense-in-depth, never a requirement -- an envelope
      // without one just skips the corruption check on import.
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
    const sizeBytes = new Blob([envelopeJson]).size;

    const exportedAtDate = new Date(file.metadata.exportedAt);
    const filename = makeBackupFilename(Number.isFinite(exportedAtDate.getTime()) ? exportedAtDate : new Date());

    const saveResult = await provider.save({
      filename,
      content: envelopeJson,
      contentType: "application/json",
      silent: input.silent,
      onProgress: (percent, message) => {
        // Fire-and-forget: a provider may call this many times in quick
        // succession during a real upload, and the job event log is
        // diagnostic, not something a save() call should have to wait on.
        void recordEvent(job.id, "saving", message || `Saving... ${percent}%`, { progressPercent: percent });
      },
    });
    if (provider.prune) await provider.prune(5);

    if (!saveResult.ok) {
      throw new Error(saveResult.error || "Could not save backup");
    }
    await recordEvent(job.id, "saving", saveResult.location || "Saved", { progressPercent: 100 });

    recordBackupSuccessDetails({
      exportedAtIso: file.metadata.exportedAt,
      sizeBytes,
      counts: file.metadata.totals,
    });
    await completeJob(job.id, { sizeBytes, filename });

    await logOperationalEvent({
      level: "info",
      type: input.eventType,
      message: input.reasonForLog,
      data: { exportedAt: file.metadata.exportedAt, schemaVersion: file.metadata.schemaVersion, totals: file.metadata.totals, provider: provider.id, jobId: job.id },
    }).catch(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failJob(job.id, message);
    throw error;
  }
}

export async function runExport(): Promise<void> {
  try {
    await logOperationalEvent({ level: "info", type: "backup.export.start", message: "Backup export started" });
    planManualBackup(); // always shouldRun; kept for a consistent Plan-shaped audit trail
    await runExportPipeline({ kind: "export", silent: false, reasonForLog: "Backup export completed", eventType: "backup.export.success" });
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
      kind: "auto",
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
  const job = await createJob("restore", getActiveProvider().id);

  try {
    await logOperationalEvent({
      level: "info",
      type: "backup.import.start",
      message: "Backup import started",
      data: { filename: file.name, size: file.size, jobId: job.id },
    });
    await recordEvent(job.id, "parsing", "Reading backup file", { data: { filename: file.name, size: file.size } });

    const text = await file.text();
    const parsed: any = JSON.parse(text);

    let bundleLike: any;
    if (isEnvelope(parsed)) {
      if (parsed.checksum) {
        const checksumOk = await verifyChecksum(parsed.payload, parsed.checksum);
        if (!checksumOk) throw new Error("Backup file failed integrity check (checksum mismatch) -- it may be corrupted.");
      }
      await recordEvent(job.id, "decompressing", parsed.compressed ? "Decompressing backup" : "Backup was not compressed");
      const decompressed = await decompress(parsed.payload, parsed.compressed);

      await recordEvent(job.id, "decrypting", parsed.encrypted ? "Decrypting backup" : "Backup was not encrypted");
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
    if (!confirmRestore) {
      await cancelJob(job.id, "Doctor declined at the confirmation prompt");
      return;
    }

    await recordEvent(job.id, "restoring", "Restoring clinic data", { data: { patients: patientsCount, consultations: consultationsCount } });
    await deserializeAndRestore(bundleLike, "overwrite");

    await logOperationalEvent({
      level: "info",
      type: "backup.import.success",
      message: "Backup import completed",
      data: { filename: file.name, jobId: job.id },
    });
    recordRestoreSuccess(new Date().toISOString());
    await completeJob(job.id, { filename: file.name });
    alert("Clinic backup restored.");
  } catch (error) {
    console.error("[backupManager] runImport failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    await failJob(job.id, message);
    await logOperationalEvent({
      level: "error",
      type: "backup.import.failure",
      message: "Backup import failed",
      data: { filename: file.name, error: message, jobId: job.id },
    }).catch(() => {});
    alert("Restore failed. The backup file looks invalid or incomplete.");
  }
}

export async function getLocalSnapshotSummary(): Promise<{ count: number; filenames: string[] }> {
  const items = (await localBackupProvider.list?.()) || [];
  return { count: items.length, filenames: items.map((i) => i.filename).sort() };
}
