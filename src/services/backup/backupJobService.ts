/**
 * backupJobService.ts
 * Sakhi Clinic — Backup Engine: job lifecycle tracking.
 *
 * Owns the BackupJob record: creation, progress events, completion,
 * failure, and querying. This is the ONLY other file (besides
 * backupManager.ts, which calls it) that knows BackupJob exists.
 * Planner/Serializer/Encryption/Compression/IntegrityValidator/
 * StorageProvider never import this module and never see a job -- they
 * are called exactly as before Phase "pre-3" introduced jobs at all.
 *
 * This is what lets Google Drive synchronization operate on BackupJobs
 * rather than directly on serialized files: a future real
 * GoogleDriveProvider reports progress via the plain onProgress callback
 * StorageProvider already defines (see storageProvider.ts) -- it never
 * imports this file or constructs a BackupJob itself. backupManager.ts is
 * the sole translator from "provider progress callback" to "job event."
 */

import { db, BackupJob, BackupJobEvent, BackupJobFailureReason, BackupJobKind, BackupJobStage, BackupJobStatus } from "../db";
import { generateId } from "../../utils/generateId";

const nowIso = () => new Date().toISOString();
const DEFAULT_MAX_RETRIES = 3;

export async function createJob(kind: BackupJobKind, providerId: string, maxRetries: number = DEFAULT_MAX_RETRIES): Promise<BackupJob> {
  const job: BackupJob = {
    id: generateId(),
    kind,
    providerId,
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    events: [],
    retryCount: 0,
    maxRetries,
  };
  await db.backupJobs.put(job);
  return job;
}

/**
 * Read-modify-write, wrapped in a Dexie transaction. This matters in
 * practice, not just in theory: a real chunked upload provider can call
 * onProgress several times in quick succession (see backupManager.ts),
 * firing concurrent, unawaited recordEvent calls for the SAME job. Without
 * a transaction, two concurrent get()-then-put() calls can both read the
 * same starting state and the second put() silently overwrites (loses)
 * the first one's event. Dexie serializes readwrite transactions against
 * the same table, so wrapping the read and write together makes each call
 * atomic relative to the others.
 */
export async function recordEvent(
  jobId: string,
  stage: BackupJobStage,
  message: string,
  input?: { progressPercent?: number; data?: Record<string, any> }
): Promise<BackupJob | null> {
  return db.transaction("rw", db.backupJobs, async () => {
    const job = await db.backupJobs.get(jobId);
    if (!job) return null;

    const event: BackupJobEvent = {
      id: generateId(),
      stage,
      message,
      timestamp: nowIso(),
      progressPercent: input?.progressPercent,
      data: input?.data,
    };

    const updated: BackupJob = {
      ...job,
      status: job.status === "queued" ? "running" : job.status,
      events: [...job.events, event],
      // Mirror the latest progress for the two stages that can realistically
      // report incremental progress, as plain fields the UI can read
      // without scanning the full event log.
      uploadProgressPercent: stage === "saving" && input?.progressPercent != null ? input.progressPercent : job.uploadProgressPercent,
      verificationProgressPercent: stage === "verifying" && input?.progressPercent != null ? input.progressPercent : job.verificationProgressPercent,
      updatedAt: nowIso(),
    };
    await db.backupJobs.put(updated);
    return updated;
  });
}

export async function completeJob(jobId: string, patch?: { sizeBytes?: number; filename?: string }): Promise<BackupJob | null> {
  return db.transaction("rw", db.backupJobs, async () => {
    const job = await db.backupJobs.get(jobId);
    if (!job) return null;

    const doneEvent: BackupJobEvent = {
      id: generateId(),
      stage: "done",
      message: "Job completed successfully",
      timestamp: nowIso(),
      progressPercent: 100,
    };

    const updated: BackupJob = {
      ...job,
      status: "succeeded",
      sizeBytes: patch?.sizeBytes ?? job.sizeBytes,
      filename: patch?.filename ?? job.filename,
      events: [...job.events, doneEvent],
      completedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await db.backupJobs.put(updated);
    return updated;
  });
}

export async function cancelJob(jobId: string, reason: string): Promise<BackupJob | null> {
  return db.transaction("rw", db.backupJobs, async () => {
    const job = await db.backupJobs.get(jobId);
    if (!job) return null;

    const cancelEvent: BackupJobEvent = {
      id: generateId(),
      stage: "done",
      message: `Job cancelled: ${reason}`,
      timestamp: nowIso(),
    };

    const updated: BackupJob = {
      ...job,
      status: "cancelled",
      events: [...job.events, cancelEvent],
      completedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await db.backupJobs.put(updated);
    return updated;
  });
}

export async function failJob(
  jobId: string,
  error: string,
  input?: { failureReason?: BackupJobFailureReason; providerMetadata?: Record<string, any> }
): Promise<BackupJob | null> {
  return db.transaction("rw", db.backupJobs, async () => {
    const job = await db.backupJobs.get(jobId);
    if (!job) return null;

    const failureEvent: BackupJobEvent = {
      id: generateId(),
      stage: "done",
      message: `Job failed: ${error}`,
      timestamp: nowIso(),
      data: input?.failureReason ? { failureReason: input.failureReason } : undefined,
    };

    const updated: BackupJob = {
      ...job,
      status: "failed",
      error,
      failureReason: input?.failureReason ?? "unknown",
      providerMetadata: input?.providerMetadata ?? job.providerMetadata,
      events: [...job.events, failureEvent],
      completedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await db.backupJobs.put(updated);
    return updated;
  });
}

/** Convenience: computes the backoff delay from the job's CURRENT retryCount and schedules it in one call. */
export async function scheduleRetryWithBackoff(jobId: string, referenceDate: Date = new Date()): Promise<BackupJob | null> {
  const job = await db.backupJobs.get(jobId);
  if (!job) return null;
  const delayMs = computeNextRetryDelayMs(job.retryCount);
  return scheduleRetry(jobId, new Date(referenceDate.getTime() + delayMs).toISOString());
}

export async function getJob(jobId: string): Promise<BackupJob | undefined> {
  return db.backupJobs.get(jobId);
}

/**
 * Ordered by when each job most recently changed (completedAt for a
 * finished job, else updatedAt, else createdAt) -- NOT plain creation
 * order. This matters for nested jobs: a safety snapshot created and
 * completed mid-restore (see backupManager.ts's runImportFromText) has a
 * LATER createdAt than the restore job that triggered it, but the restore
 * job's own completedAt is later still (it finishes after the snapshot
 * does) -- creation-order sorting would incorrectly report the snapshot,
 * not the restore, as "the doctor's most recent operation."
 */
export async function listRecentJobs(limit = 20): Promise<BackupJob[]> {
  const rows = await db.backupJobs.toArray();
  const sortKey = (job: BackupJob) => job.completedAt ?? job.updatedAt ?? job.createdAt;
  rows.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return rows.slice(0, Math.max(0, limit));
}

/** Failed jobs under their retry cap whose scheduled retry time has arrived. */
export async function listJobsDueForRetry(referenceDate: Date = new Date()): Promise<BackupJob[]> {
  const failed = await db.backupJobs.where("status").equals("failed").toArray();
  const nowMs = referenceDate.getTime();
  return failed.filter((j) => {
    if (j.retryCount >= j.maxRetries) return false;
    if (!j.nextRetryAt) return false;
    return Date.parse(j.nextRetryAt) <= nowMs;
  });
}

const BASE_RETRY_DELAY_MS = 30_000; // 30s
const MAX_RETRY_DELAY_MS = 30 * 60_000; // 30 min cap

/** Exponential backoff: 30s, 1m, 2m, 4m, ... capped at 30 minutes. */
export function computeNextRetryDelayMs(retryCount: number, baseDelayMs = BASE_RETRY_DELAY_MS, maxDelayMs = MAX_RETRY_DELAY_MS): number {
  const delay = baseDelayMs * Math.pow(2, Math.max(0, retryCount));
  return Math.min(delay, maxDelayMs);
}

/** Schedule a retry: increments retryCount and sets nextRetryAt via exponential backoff, without re-attempting anything itself -- see backupManager.ts (schedules automatically on failure) and backupRetryService.ts (the periodic sweep that actually re-runs the pipeline). */
export async function scheduleRetry(jobId: string, nextRetryAt: string): Promise<BackupJob | null> {
  return db.transaction("rw", db.backupJobs, async () => {
    const job = await db.backupJobs.get(jobId);
    if (!job) return null;

    const event: BackupJobEvent = {
      id: generateId(),
      stage: "done",
      message: `Retry scheduled for ${nextRetryAt}`,
      timestamp: nowIso(),
    };

    const updated: BackupJob = {
      ...job,
      retryCount: job.retryCount + 1,
      nextRetryAt,
      events: [...job.events, event],
      updatedAt: nowIso(),
    };
    await db.backupJobs.put(updated);
    return updated;
  });
}

export function jobStatusFilter(status: BackupJobStatus) {
  return db.backupJobs.where("status").equals(status).toArray();
}
