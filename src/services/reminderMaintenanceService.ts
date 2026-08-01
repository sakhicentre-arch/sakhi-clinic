/**
 * reminderMaintenanceService.ts
 * Sakhi Clinic — Reminder Engine: retries (Phase 2).
 *
 * Single responsibility: retry failed reminders. Mirrors
 * outboxMaintenanceService.ts's retryFailed() exactly in spirit: moves
 * failed -> pending, never auto-sends. Outbound patient communication
 * stays doctor-gated even on retry -- a retried reminder re-enters the
 * approval queue, it does not bypass it.
 *
 * Hooked into the existing periodic maintenance runtime
 * (maintenanceRuntimeService.ts), which already runs every 5 minutes and
 * once at app start -- no new scheduling mechanism was introduced.
 */

import { db, ReminderQueueEntry } from "./db";
import { logOperationalEvent } from "./operationalEventLogService";

const nowIso = () => new Date().toISOString();
const DEFAULT_MAX_RETRY_COUNT = 3;

export async function retryFailedReminders(maxRetryCount: number = DEFAULT_MAX_RETRY_COUNT): Promise<number> {
  const failed = await db.reminderQueue.where("status").equals("failed").toArray();
  const eligible = failed.filter((r) => (r.retryCount || 0) < maxRetryCount);
  if (eligible.length === 0) return 0;

  const updated: ReminderQueueEntry[] = eligible.map((r) => ({
    ...r,
    status: "pending",
    retryCount: (r.retryCount || 0) + 1,
    updatedAt: nowIso(),
  }));
  await db.reminderQueue.bulkPut(updated);

  await logOperationalEvent({
    level: "info",
    type: "reminder.retry",
    message: `${updated.length} failed reminder(s) returned to pending for re-approval`,
    data: { count: updated.length, reminderIds: updated.map((r) => r.id) },
  }).catch(() => {});

  return updated.length;
}

/** Count of pending reminders the doctor hasn't reviewed in a while -- a
 * signal for the UI/analytics, never auto-actioned on. */
export async function countStalePendingReminders(maxAgeDays = 3, referenceDate: Date = new Date()): Promise<number> {
  const pending = await db.reminderQueue.where("status").equals("pending").toArray();
  const cutoff = referenceDate.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return pending.filter((r) => new Date(r.createdAt).getTime() < cutoff).length;
}
