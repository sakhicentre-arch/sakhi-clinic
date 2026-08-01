/**
 * backupRetryService.ts
 * Sakhi Clinic — Backup Engine: periodic retry sweep (Phase 3).
 *
 * Single responsibility: find failed export/auto jobs whose backoff
 * window has arrived and re-attempt each one via backupManager.retryJob.
 * The backoff math itself (computeNextRetryDelayMs) and the "schedule the
 * next window" step live in backupJobService.ts and run automatically
 * inside backupManager.ts's own failure handling -- this file never
 * computes a delay itself, it only asks "whose window is up right now?"
 * (backupJobService.listJobsDueForRetry) and acts on the answer.
 *
 * Mirrors this codebase's existing retry idioms
 * (outboxMaintenanceService.retryFailed, reminderMaintenanceService.
 * retryFailedReminders): failed -> retried, never silently abandoned,
 * never auto-escalated beyond its cap. Restore jobs are never retried
 * here -- see backupManager.retryJob's own comment for why.
 */

import { listJobsDueForRetry } from "./backupJobService";
import { retryJob } from "./backupManager";
import { logOperationalEvent } from "../operationalEventLogService";

export interface RetryRunSummary {
  attempted: number;
  succeeded: number;
  stillFailed: number;
}

/**
 * Called from the periodic maintenance runtime (see
 * maintenanceRuntimeService.ts), the same place outbox and reminder
 * retries already run from -- no new scheduling mechanism was introduced.
 */
export async function retryEligibleBackupJobs(referenceDate: Date = new Date()): Promise<RetryRunSummary> {
  const due = await listJobsDueForRetry(referenceDate);
  const summary: RetryRunSummary = { attempted: 0, succeeded: 0, stillFailed: 0 };

  for (const job of due) {
    summary.attempted++;
    const result = await retryJob(job.id);

    if (result.ok) {
      summary.succeeded++;
    } else {
      summary.stillFailed++;
    }
  }

  if (summary.attempted > 0) {
    await logOperationalEvent({
      level: summary.stillFailed > 0 ? "warn" : "info",
      type: "backup.retry.sweep",
      message: `Backup retry sweep: ${summary.succeeded}/${summary.attempted} succeeded`,
      data: summary,
    }).catch(() => {});
  }

  return summary;
}
