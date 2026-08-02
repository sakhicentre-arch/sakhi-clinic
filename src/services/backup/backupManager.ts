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
 * Provider selection is resolved from the doctor's own persisted
 * preference (backupSettingsService.getBackupSettings().destination),
 * looked up in providerRegistry.ts -- never a hardcoded import, never an
 * in-memory-only flag. Connecting Google Drive (OAuth) and choosing it as
 * a destination are completely independent: authenticating only ever
 * means "Google Drive is available," never "Google Drive is now where
 * backups go" -- see providerRegistry.ts and backupSettingsService.ts.
 * Every function in this file calls getActiveProvider() and nothing else;
 * none of them can drift into assuming which concrete provider is active.
 * This file still contains zero provider-specific logic anywhere -- it
 * never imports googleDriveProvider or googleOAuthService directly, only
 * the registry.
 */

import { planAutoBackup, planManualBackup } from "./backupPlanner";
import { serializeBackup, parseBackupJson, planRestore, deserializeAndRestore, makeBackupFilename } from "./backupSerializer";
import { encrypt, decrypt } from "./encryptionLayer";
import { compress, decompress } from "./compressionLayer";
import { validateBundleShape, computeChecksum, verifyChecksum } from "./integrityValidator";
import { localBackupProvider } from "./providers/localBackupProvider";
import { getProviderById } from "./providers/providerRegistry";
import type { StorageProvider, StorageProviderListEntry } from "./storageProvider";
import { createJob, recordEvent, completeJob, failJob, cancelJob, getJob, listJobsDueForRetry, scheduleRetry, scheduleRetryWithBackoff } from "./backupJobService";
import type { BackupJob, BackupJobFailureReason, BackupJobKind } from "../db";
import { recordBackupSuccessDetails, recordRestoreSuccess } from "../storageHealthService";
import { logOperationalEvent } from "../operationalEventLogService";
import { getBackupSettings } from "./backupSettingsService";
import { generateId } from "../../utils/generateId";

/**
 * Test/advanced-only override -- production UI code never calls this
 * (nothing in src/pages or src/App.tsx references it). Its sole purpose
 * is letting tests inject an arbitrary fake StorageProvider to exercise
 * this file's retry/verification/error-handling logic without needing a
 * real or mocked Google Drive. When unset (the only state real doctors
 * ever see), getActiveProvider() resolves purely from persisted settings.
 */
let testOverrideProvider: StorageProvider | null = null;

/** The provider every pipeline function below actually uses: the doctor's
 * persisted destination preference, resolved through the provider
 * registry. Falls back to local if the stored destination id doesn't
 * match any registered provider (e.g. corrupted preference, or a
 * provider that existed in an older build and was since removed) --
 * never because a provider merely isn't connected right now (see
 * resolveAutoBackupProvider below for where THAT distinction matters). */
export function getActiveProvider(): StorageProvider {
  if (testOverrideProvider) return testOverrideProvider;
  const { destination } = getBackupSettings();
  return getProviderById(destination) ?? localBackupProvider;
}

/** Test/advanced-only -- see testOverrideProvider above. */
export function setActiveProvider(provider: StorageProvider): void {
  testOverrideProvider = provider;
}

/** Test/advanced-only -- clears the override above; does NOT touch the
 * doctor's persisted destination preference. */
export function resetActiveProviderToLocal(): void {
  testOverrideProvider = null;
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
async function runPipelineForJob(
  jobId: string,
  input: { kind: BackupJobKind; silent: boolean; reasonForLog: string; eventType: string },
  providerOverride?: StorageProvider
): Promise<void> {
  const provider = providerOverride ?? getActiveProvider();

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

/** frequency -> staleness window, only consulted when Automatic Backup is
 * on (see backupSettingsService.ts). "before-update"/"before-restore" are
 * event-triggered, not age-based -- runAutoIfDue's own staleness check
 * doesn't apply to them, so they fall through to the same default window
 * as if no frequency were set. Both are documented extension points only,
 * not implemented yet: "before-restore" would call runAutoIfDue with
 * minHoursBetweenBackups: 0 from inside runImportFromText, right before
 * deserializeAndRestore's destructive overwrite; "before-update" needs an
 * app-update-detected lifecycle event this app doesn't have yet. */
function minHoursForFrequency(frequency: ReturnType<typeof getBackupSettings>["frequency"]): number | undefined {
  if (frequency === "daily") return 24;
  if (frequency === "weekly") return 24 * 7;
  return undefined;
}

export async function runAutoIfDue(input?: { reason?: string; minHoursBetweenBackups?: number }): Promise<void> {
  try {
    const settings = getBackupSettings();
    const minHours = input?.minHoursBetweenBackups ?? (settings.autoBackupEnabled ? minHoursForFrequency(settings.frequency) : undefined);
    const plan = planAutoBackup({ minHoursBetweenBackups: minHours });
    if (!plan.shouldRun) return;

    const provider = getActiveProvider();
    const job = await createJob("auto", provider.id);
    try {
      await runPipelineForJob(
        job.id,
        { kind: "auto", silent: true, reasonForLog: "Automatic backup snapshot created", eventType: "backup.auto.success" },
        provider
      );
    } catch (primaryError) {
      // Automatic/unattended runs get one extra safety net manual runs
      // deliberately don't: if the chosen destination is unusable for
      // ANY reason right now (not connected, token expired, network
      // down, quota), retry once against local instead of letting the
      // doctor's automatic backups silently stop with no visible failure
      // until they happen to check Settings. This is deliberately
      // reactive (an actual save attempt failed), not a pre-check --
      // StorageProvider.available reflects configuration, not live
      // connection state (see googleDriveProvider.ts's own comment), so
      // a pre-check would miss the single most common real case: the
      // destination is configured but simply not signed in right now.
      // A manual "Backup Now" click, by contrast, is attended --
      // runPipelineForJob's own honest failure (the provider's own
      // NOT_CONNECTED_MESSAGE) is exactly the right, visible outcome
      // there, so this retry is NOT applied to manual operations.
      if (provider.id === localBackupProvider.id) throw primaryError; // already local -- nothing to fall back to
      await logOperationalEvent({
        level: "warn",
        type: "backup.auto.destination_unavailable",
        message: `${provider.label} backup failed -- automatic backup fell back to this device`,
        data: { destination: provider.id, error: primaryError instanceof Error ? primaryError.message : String(primaryError) },
      }).catch(() => {});
      const fallbackJob = await createJob("auto", localBackupProvider.id);
      await runPipelineForJob(
        fallbackJob.id,
        { kind: "auto", silent: true, reasonForLog: "Automatic backup snapshot created (local fallback)", eventType: "backup.auto.success" },
        localBackupProvider
      );
    }
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

export interface BackupPreview {
  filename: string;
  sizeBytes?: number;
  exportedAt: string;
  deviceId: string;
  patients: number;
  consultations: number;
  /** "none" means the envelope carried no checksum to verify (older
   * format) -- never treated as a failure, just less certain. An actual
   * mismatch throws during parsing instead of reaching this state. */
  checksumStatus: "valid" | "none";
  compressed: boolean;
  encrypted: boolean;
}

type ParsedBackup = {
  bundleLike: any;
  preview: Omit<BackupPreview, "filename" | "sizeBytes">;
};

/**
 * Parses, decompresses/decrypts, and checksum-verifies raw backup text
 * into a restorable bundle plus preview info -- shared by both restore
 * entry points below and by the preview API further down, so parsing/
 * validation logic exists exactly once regardless of how a doctor chose
 * to restore.
 */
async function parseAndValidateBackup(text: string): Promise<ParsedBackup> {
  const parsed: any = JSON.parse(text);

  let bundleLike: any;
  let checksumStatus: BackupPreview["checksumStatus"] = "none";
  let compressed = false;
  let encrypted = false;

  if (isEnvelope(parsed)) {
    compressed = parsed.compressed;
    encrypted = parsed.encrypted;
    if (parsed.checksum) {
      const checksumOk = await verifyChecksum(parsed.payload, parsed.checksum);
      if (!checksumOk) throw new Error("Backup file failed integrity check (checksum mismatch) -- it may be corrupted.");
      checksumStatus = "valid";
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
  return {
    bundleLike,
    preview: {
      exportedAt: String(bundleLike?.exportedAt || ""),
      deviceId: String(bundleLike?.deviceId || ""),
      patients: plan.incoming.patients ?? 0,
      consultations: plan.incoming.consultations ?? 0,
      checksumStatus,
      compressed,
      encrypted,
    },
  };
}

/**
 * A fast, local-only, best-effort snapshot taken immediately before every
 * restore's destructive overwrite -- independent of the doctor's chosen
 * destination or Automatic Backup setting (a restore is destructive
 * enough that this one isn't opt-in), and independent of network
 * availability (the whole point is a safety net that doesn't depend on
 * Drive being reachable). Uses the full tracked pipeline (so it shows up
 * in Backup History like any other backup) rather than a bare
 * provider.save() call, to reuse the same encrypt/compress/checksum
 * logic instead of duplicating it. A failure here is logged but never
 * blocks or fails the actual restore.
 */
async function takeRestoreSafetySnapshot(): Promise<void> {
  try {
    const snapshotJob = await createJob("auto", localBackupProvider.id);
    await runPipelineForJob(
      snapshotJob.id,
      { kind: "auto", silent: true, reasonForLog: "Safety snapshot before restore", eventType: "backup.auto.success" },
      localBackupProvider
    );
  } catch (error) {
    await logOperationalEvent({
      level: "warn",
      type: "backup.auto.failure",
      message: "Pre-restore safety snapshot failed (restore will still proceed)",
      data: { error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
  }
}

/**
 * The actual restore, shared by both the legacy confirm()-based flow
 * (runImportFromText, below) and the preview/confirm flow
 * (confirmPendingRestore, further below) -- neither duplicates the
 * safety snapshot, the deserializeAndRestore call, or success/failure
 * bookkeeping.
 */
async function executeRestore(jobId: string, parsedBackup: ParsedBackup, meta: { filename: string; size?: number }): Promise<{ ok: boolean; error?: string }> {
  try {
    await takeRestoreSafetySnapshot();

    await recordEvent(jobId, "restoring", "Restoring clinic data", {
      data: { patients: parsedBackup.preview.patients, consultations: parsedBackup.preview.consultations },
    });
    await deserializeAndRestore(parsedBackup.bundleLike, "overwrite");

    await logOperationalEvent({
      level: "info",
      type: "backup.import.success",
      message: "Backup import completed",
      data: { filename: meta.filename, jobId },
    });
    recordRestoreSuccess(new Date().toISOString());
    await completeJob(jobId, { filename: meta.filename });
    return { ok: true };
  } catch (error) {
    console.error("[backupManager] restore failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    await failJob(jobId, message, { failureReason: categorizeError(error) });
    await logOperationalEvent({
      level: "error",
      type: "backup.import.failure",
      message: "Backup import failed",
      data: { filename: meta.filename, error: message, jobId },
    }).catch(() => {});
    return { ok: false, error: message };
  }
}

/**
 * Legacy/backward-compatible entry point -- parses, shows a native
 * window.confirm() (not the richer in-app preview; see
 * previewLocalFile/previewRemoteBackup + confirmPendingRestore below for
 * that), and restores. Kept for existing callers/tests; the current UI
 * uses the preview flow instead.
 */
async function runImportFromText(providerId: string, text: string, meta: { filename: string; size?: number }): Promise<void> {
  const job = await createJob("restore", providerId);

  try {
    await logOperationalEvent({
      level: "info",
      type: "backup.import.start",
      message: "Backup import started",
      data: { filename: meta.filename, size: meta.size, jobId: job.id },
    });
    await recordEvent(job.id, "parsing", "Reading backup file", { data: { filename: meta.filename, size: meta.size } });

    const parsedBackup = await parseAndValidateBackup(text);
    await recordEvent(job.id, "decompressing", parsedBackup.preview.compressed ? "Decompressing backup" : "Backup was not compressed");
    await recordEvent(job.id, "decrypting", parsedBackup.preview.encrypted ? "Decrypting backup" : "Backup was not encrypted");

    const confirmRestore = window.confirm(
      [
        "Restore clinic backup?",
        "",
        `Exported: ${parsedBackup.preview.exportedAt || "Unknown date"}`,
        `Device: ${parsedBackup.preview.deviceId || "Unknown device"}`,
        `Patients: ${parsedBackup.preview.patients}`,
        `Consultations: ${parsedBackup.preview.consultations}`,
        "",
        "This will overwrite ALL existing clinic data on this device.",
        "Continue?",
      ].join("\n")
    );
    if (!confirmRestore) {
      await cancelJob(job.id, "Doctor declined at the confirmation prompt");
      return;
    }

    const result = await executeRestore(job.id, parsedBackup, meta);
    alert(result.ok ? "Clinic backup restored." : "Restore failed. The backup file looks invalid or incomplete.");
  } catch (error) {
    console.error("[backupManager] restore failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    await failJob(job.id, message, { failureReason: categorizeError(error) });
    await logOperationalEvent({
      level: "error",
      type: "backup.import.failure",
      message: "Backup import failed",
      data: { filename: meta.filename, error: message, jobId: job.id },
    }).catch(() => {});
    alert("Restore failed. The backup file looks invalid or incomplete.");
  }
}

/** Destination = Local: the doctor picked a file via the browser's file input. */
export async function runImport(file: File): Promise<void> {
  const text = await file.text();
  await runImportFromText(localBackupProvider.id, text, { filename: file.name, size: file.size });
}

/**
 * Destination = a remote provider (Google Drive, and later OneDrive/
 * Dropbox/S3/iCloud): no local file picker at all -- the doctor instead
 * chooses from listRestorableBackups() below, and this downloads +
 * restores the chosen one through the exact same core as a local restore.
 */
export async function runImportFromProvider(filename: string): Promise<{ ok: boolean; error?: string }> {
  const provider = getActiveProvider();
  if (!provider.load) {
    return { ok: false, error: `${provider.label} does not support restoring directly -- no download capability.` };
  }
  const text = await provider.load(filename);
  if (text == null) {
    return { ok: false, error: `Could not download "${filename}" from ${provider.label}.` };
  }
  await runImportFromText(provider.id, text, { filename });
  return { ok: true };
}

/**
 * Preview/confirm restore flow -- what the current UI actually uses,
 * replacing a blocking native window.confirm() with a real in-app
 * preview panel the doctor can review (exported date, counts, checksum
 * status) before committing. Only one preview is held at a time (a
 * single-user, single-tab, seconds-long UI interaction never needs more)
 * -- starting a new preview silently discards a stale one instead of
 * accumulating state. The token defends confirmPendingRestore against
 * acting on a preview that's no longer the one currently shown.
 */
let pendingRestore: { token: string; providerId: string; meta: { filename: string; size?: number }; parsed: ParsedBackup } | null = null;

async function buildPreview(
  providerId: string,
  text: string,
  meta: { filename: string; size?: number }
): Promise<{ ok: true; token: string; preview: BackupPreview } | { ok: false; error: string }> {
  try {
    const parsed = await parseAndValidateBackup(text);
    const token = generateId();
    pendingRestore = { token, providerId, meta, parsed };
    return { ok: true, token, preview: { ...parsed.preview, filename: meta.filename, sizeBytes: meta.size } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Destination = Local: reads the picked file and validates it, without restoring yet. */
export async function previewLocalFile(file: File) {
  const text = await file.text();
  return buildPreview(localBackupProvider.id, text, { filename: file.name, size: file.size });
}

/** Destination = a remote provider: downloads the chosen backup and validates it, without restoring yet. */
export async function previewRemoteBackup(filename: string) {
  const provider = getActiveProvider();
  if (!provider.load) {
    return { ok: false as const, error: `${provider.label} does not support restoring directly -- no download capability.` };
  }
  const text = await provider.load(filename);
  if (text == null) {
    return { ok: false as const, error: `Could not download "${filename}" from ${provider.label}.` };
  }
  return buildPreview(provider.id, text, { filename });
}

/** Discards the current preview without restoring anything. */
export function cancelPendingRestore(): void {
  pendingRestore = null;
}

/** Commits a previously-built preview. Fails cleanly (no crash, no
 * partial state) if the preview has expired or was already acted on --
 * pendingRestore is cleared as soon as this starts, so a duplicate/stale
 * confirm click can't restore twice. */
export async function confirmPendingRestore(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!pendingRestore || pendingRestore.token !== token) {
    return { ok: false, error: "This preview has expired. Please choose the backup again." };
  }
  const { providerId, meta, parsed } = pendingRestore;
  pendingRestore = null;

  const job = await createJob("restore", providerId);
  await logOperationalEvent({
    level: "info",
    type: "backup.import.start",
    message: "Backup import started",
    data: { filename: meta.filename, size: meta.size, jobId: job.id },
  });
  return executeRestore(job.id, parsed, meta);
}

/**
 * Destination = a remote provider: what the doctor picks a backup from.
 * Empty array (never throws) if the active provider can't list, isn't
 * connected, or the list call fails -- the UI shows "no backups found"
 * either way rather than distinguishing every failure mode.
 */
export async function listRestorableBackups(): Promise<StorageProviderListEntry[]> {
  const provider = getActiveProvider();
  if (!provider.list) return [];
  try {
    return await provider.list();
  } catch {
    return [];
  }
}

/** Destination = a remote provider: removes a listed backup (the Drive
 * backup browser's delete action). Gated by capabilities.supportsDelete
 * in the UI; still checks provider.delete's own existence here so this
 * is safe to call regardless. */
export async function deleteRemoteBackup(filename: string): Promise<{ ok: boolean; error?: string }> {
  const provider = getActiveProvider();
  if (!provider.delete) {
    return { ok: false, error: `${provider.label} does not support deleting backups.` };
  }
  return provider.delete(filename);
}

export async function getLocalSnapshotSummary(): Promise<{ count: number; filenames: string[] }> {
  const items = (await localBackupProvider.list?.()) || [];
  return { count: items.length, filenames: items.map((i) => i.filename).sort() };
}

export { listJobsDueForRetry, scheduleRetry };
export type { BackupJob };
