/**
 * backupManager.ts
 * Sakhi Clinic — Backup Engine: orchestrator.
 *
 * The only file that wires all the layers together:
 *
 *   Backup Manager (this file)
 *           |
 *   Backup Job              -- persisted lifecycle + progress record
 *           |
 *   Backup Planner          -- should this run, and what kind?
 *           |
 *   Backup Serializer       -- build the bundle + metadata, JSON-encode it
 *           |
 *   Encryption Layer        -- pass-through today (see encryptionLayer.ts)
 *           |
 *   Compression Layer       -- real gzip, backward-compatible
 *           |
 *   Integrity Validator     -- shape check + checksum
 *           |
 *   Storage Provider        -- local by default; Google Drive is a real,
 *                               wired-in implementation, honestly
 *                               unavailable until OAuth is configured
 *
 * This is the ONLY file that knows about the envelope format wrapping a
 * compressed/encrypted payload, AND the only file (besides
 * backupJobService.ts itself) that knows BackupJob exists. Every layer
 * above only knows its own input/output shape -- none of them know which
 * storage provider is being used, the storage provider doesn't know
 * anything about compression/encryption/backup content, and NEITHER of
 * them knows a job is being tracked. A real GoogleDriveProvider plugs into
 * the exact same pipeline: it reports progress via the plain onProgress
 * callback StorageProvider already defines, and this file is solely
 * responsible for turning that into BackupJob events.
 *
 * Provider selection is a runtime value (getActiveProvider/setActiveProvider
 * below), not a hardcoded import used directly in the pipeline -- so
 * connecting a real Google Drive later (Settings UI calling
 * setActiveProvider once OAuth succeeds) is a single function call from
 * outside this file, not a source edit here. Every function in this file
 * calls getActiveProvider() and nothing else; none of them can drift into
 * assuming which concrete provider is active. This file also contains
 * zero Drive-specific logic anywhere -- it never imports googleDriveProvider
 * or googleOAuthService directly.
 */

import { planAutoBackup, planManualBackup } from "./backupPlanner";
import { serializeBackup, parseBackupJson, planRestore, deserializeAndRestore, makeBackupFilename } from "./backupSerializer";
import { encrypt, decrypt } from "./encryptionLayer";
import { compress, decompress } from "./compressionLayer";
import { validateBundleShape, computeChecksum, verifyChecksum } from "./integrityValidator";
import { localBackupProvider } from "./providers/localBackupProvider";
import type { StorageProvider } from "./storageProvider";
import { createJob, recordEvent, completeJob, failJob, cancelJob, getJob, listJobsDueForRetry, scheduleRetry, scheduleRetryWithBackoff } from "./backupJobService";
import type { BackupJob, BackupJobFailureReason, BackupJobKind } from "../db";
import { recordBackupSuccessDetails, recordRestoreSuccess } from "../storageHealthService";
import { logOperationalEvent } from "../operationalEventLogService";

let activeProvider: StorageProvider = localBackupProvider;

/** The provider every pipeline function below actually uses. */
export function getActiveProvider(): StorageProvider {
  return activeProvider;
}

/** Called once a real provider (e.g. a connected Google Drive) is ready to take over. */
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

/** Coarse, best-effort categorization from an error message -- lets retry
 * logic and the UI distinguish "worth auto-retrying" from "needs the
 * doctor to act" without every call site having to know the taxonomy. */
function categorizeError(error: unknown): BackupJobFailureReason {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes("not connected") || message.includes("oauth") || message.includes("sign in") || message.includes("401") || message.includes("403")) return "auth";
  if (message.includes("quota") || message.includes("429")) return "quota";
  if (message.includes("checksum") || message.includes("corrupt")) return "corruption";
  if (message.includes("cancelled") || message.includes("canceled")) return "cancelled";
  if (message.includes("valid")) return "validation";
  if (message.includes("network") || message.includes("fetch") || message.includes("offline")) return "network";
  return "unknown";
}

/**
 * Runs the export pipeline for an ALREADY-CREATED job -- shared by the
 * first attempt (runExportPipeline, below) and retryJob (which reuses the
 * same job id rather than creating a new one, so its full history stays
 * on one record).
 */
async function runPipelineForJob(jobId: string, input: { kind: BackupJobKind; silent: boolean; reasonForLog: string; eventType: string }): Promise<void> {
  const provider = getActiveProvider();

  try {
    await recordEvent(jobId, "planning", "Planning backup");

    const { file, json } = await serializeBackup();
    await recordEvent(jobId, "serializing", "Serialized clinic data bundle", { data: { totals: file.metadata.totals } });

    const shapeCheck = await validateBundleShape(file.data.bundle);
    if (!shapeCheck.ok) {
      throw new Error(shapeCheck.error || "Backup validation failed before it was saved");
    }
    await recordEvent(jobId, "validating", "Validated bundle shape");

    const encryptionResult = await encrypt(json);
    await recordEvent(
      jobId,
      "encrypting",
      encryptionResult.encrypted ? "Encrypted backup" : "Encryption not yet implemented in this build -- stored as-is"
    );

    const compressionResult = await compress(encryptionResult.content);
    await recordEvent(
      jobId,
      "compressing",
      compressionResult.compressed ? "Compressed backup" : "Compression unavailable in this browser -- stored uncompressed"
    );

    let checksum: string | undefined;
    try {
      checksum = await computeChecksum(compressionResult.content);
    } catch {
      // Checksum is defense-in-depth, never a requirement -- an envelope
      // without one just skips the corruption check on import/verification.
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
        void recordEvent(jobId, "saving", message || `Saving... ${percent}%`, { progressPercent: percent });
      },
    });
    if (provider.prune) await provider.prune(5);

    if (!saveResult.ok) {
      throw new Error(saveResult.error || "Could not save backup");
    }
    await recordEvent(jobId, "saving", saveResult.location || "Saved", { progressPercent: 100 });

    // Post-save verification: if this provider can read back what it just
    // stored, do so and compare checksums -- real corruption detection
    // (did storage/transport mangle the file?), not decorative. Providers
    // that can't support this (no load()) simply skip it; the pre-save
    // shape/roundtrip checks already ran regardless.
    //
    // load() returns the WHOLE envelope (metadata + payload) exactly as it
    // was saved -- the same bytes checked back in during a restore (see
    // runImport below). checksum was computed over just the inner payload,
    // so it must be compared against the envelope's own .payload field,
    // never against the raw readback -- comparing against the raw readback
    // would fail every single time, since the envelope is always larger
    // than the payload it wraps.
    if (provider.load && checksum) {
      await recordEvent(jobId, "verifying", "Verifying saved backup", { progressPercent: 0 });
      try {
        const readBack = await provider.load(filename);
        if (readBack != null) {
          let payloadToVerify: string | null = readBack;
          try {
            const parsedReadBack = JSON.parse(readBack);
            if (isEnvelope(parsedReadBack)) payloadToVerify = parsedReadBack.payload;
          } catch {
            // Not JSON (or not an envelope) -- verify the raw readback as-is.
          }
          const verifyOk = await verifyChecksum(payloadToVerify, checksum);
          await recordEvent(jobId, "verifying", verifyOk ? "Verification passed" : "Verification failed -- checksum mismatch after save", {
            progressPercent: 100,
            data: { verified: verifyOk },
          });
          if (!verifyOk) {
            throw new Error("Saved backup failed post-save verification (checksum mismatch)");
          }
        } else {
          await recordEvent(jobId, "verifying", "Could not read back saved backup to verify -- save is still recorded as successful", { progressPercent: 100 });
        }
      } catch (verifyError) {
        // A verification failure means the STORED copy may be bad even
        // though save() reported success -- this must fail the job, not
        // be swallowed.
        throw verifyError;
      }
    }

    recordBackupSuccessDetails({
      exportedAtIso: file.metadata.exportedAt,
      sizeBytes,
      counts: file.metadata.totals,
    });
    await completeJob(jobId, { sizeBytes, filename });

    await logOperationalEvent({
      level: "info",
      type: input.eventType,
      message: input.reasonForLog,
      data: { exportedAt: file.metadata.exportedAt, schemaVersion: file.metadata.schemaVersion, totals: file.metadata.totals, provider: provider.id, jobId },
    }).catch(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failJob(jobId, message, { failureReason: categorizeError(error), providerMetadata: { providerId: provider.id } });

    // Auto-schedule the NEXT retry window (never a restore -- see
    // retryJob's own comment). This runs on every failure, including
    // failures during a retry attempt itself, since both paths go
    // through this same function -- backupRetryService.ts's periodic
    // sweep only needs to find jobs whose window has arrived, never
    // compute backoff itself.
    if (input.kind !== "restore") {
      const failedJob = await getJob(jobId);
      if (failedJob && failedJob.retryCount < failedJob.maxRetries) {
        await scheduleRetryWithBackoff(jobId);
      }
    }
    throw error;
  }
}

async function runExportPipeline(input: { kind: BackupJobKind; silent: boolean; reasonForLog: string; eventType: string }): Promise<void> {
  const provider = getActiveProvider();
  const job = await createJob(input.kind, provider.id);
  await runPipelineForJob(job.id, input);
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

/**
 * Re-attempts a failed export/auto job, reusing its existing id so the
 * full history (original failure plus this attempt) stays on one
 * append-only record. Restore jobs are not retried here -- a restore
 * needs the doctor to re-select the file, matching how Reminders' own
 * "Resend" is always an explicit action, never automatic for anything
 * that isn't purely re-derivable from already-stored data. If this
 * attempt also fails, runPipelineForJob's own catch block schedules the
 * NEXT retry window automatically (same as the first failure) --
 * backupRetryService.ts's periodic sweep only needs to find jobs whose
 * window has already arrived, never compute backoff itself.
 */
export async function retryJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const job = await getJob(jobId);
  if (!job) return { ok: false, error: "Job not found" };
  if (job.kind === "restore") return { ok: false, error: "Restore jobs cannot be automatically retried -- re-select the backup file" };
  if (job.status !== "failed") return { ok: false, error: `Only failed jobs can be retried (current status: ${job.status})` };

  try {
    await runPipelineForJob(job.id, {
      kind: job.kind,
      silent: job.kind === "auto",
      reasonForLog: job.kind === "auto" ? "Automatic local backup snapshot created (retry)" : "Backup export completed (retry)",
      eventType: job.kind === "auto" ? "backup.auto.success" : "backup.export.success",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
    await failJob(job.id, message, { failureReason: categorizeError(error) });
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

export { listJobsDueForRetry, scheduleRetry };
export type { BackupJob };
