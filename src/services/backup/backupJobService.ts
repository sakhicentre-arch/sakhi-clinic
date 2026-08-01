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

import { db, BackupJob, BackupJobEvent, BackupJobKind, BackupJobStage, BackupJobStatus } from "../db";
import { generateId } from "../../utils/generateId";

const nowIso = () => new Date().toISOString();

export async function createJob(kind: BackupJobKind, providerId: string): Promise<BackupJob> {
  const job: BackupJob = {
    id: generateId(),
    kind,
    providerId,
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    events: [],
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

export async function failJob(jobId: string, error: string): Promise<BackupJob | null> {
  return db.transaction("rw", db.backupJobs, async () => {
    const job = await db.backupJobs.get(jobId);
    if (!job) return null;

    const failureEvent: BackupJobEvent = {
      id: generateId(),
      stage: "done",
      message: `Job failed: ${error}`,
      timestamp: nowIso(),
    };

    const updated: BackupJob = {
      ...job,
      status: "failed",
      error,
      events: [...job.events, failureEvent],
      completedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await db.backupJobs.put(updated);
    return updated;
  });
}

export async function getJob(jobId: string): Promise<BackupJob | undefined> {
  return db.backupJobs.get(jobId);
}

export async function listRecentJobs(limit = 20): Promise<BackupJob[]> {
  const rows = await db.backupJobs.orderBy("createdAt").toArray();
  return rows.slice(-Math.max(0, limit)).reverse();
}

export function jobStatusFilter(status: BackupJobStatus) {
  return db.backupJobs.where("status").equals(status).toArray();
}
