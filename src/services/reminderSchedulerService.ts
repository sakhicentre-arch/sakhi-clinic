/**
 * reminderSchedulerService.ts
 * Sakhi Clinic — Reminder Engine: scheduling (Phase 2).
 *
 * Single responsibility: decide WHEN a reminder should exist and enqueue
 * it. Reuses followUpIntelligenceService.ts's buckets (Phase 1) as its
 * only data source rather than re-deriving follow-up due-dates -- this
 * module never reads patients/consultations directly.
 *
 * Idempotent by design: safe to call on every periodic maintenance tick
 * (reminderMaintenanceService.ts) without ever double-queuing the same
 * patient, via reminderQueueService's hasActiveReminder check.
 */

import { getFollowUpBuckets, FollowUpBucketEntry } from "./followUpIntelligenceService";
import { enqueueReminder, hasActiveReminder } from "./reminderQueueService";
import { ReminderQueueEntry } from "./db";

const CLINIC_NAME = "Sakhi Homeopathic Clinic";

function buildFollowUpMessage(entry: FollowUpBucketEntry, isOverdue: boolean): string {
  const greeting = `*${CLINIC_NAME}*`;
  const body = isOverdue
    ? `Hi ${entry.patientName}, your follow-up visit was due on ${entry.nextFollowUpDate ? new Date(entry.nextFollowUpDate).toLocaleDateString() : "an earlier date"}. Please book a visit at your earliest convenience.`
    : `Hi ${entry.patientName}, this is a reminder that your follow-up visit is due today. Please visit the clinic or reply to reschedule.`;
  return `${greeting}\n${body}`;
}

/**
 * Schedules follow-up reminders for patients in the overdue and due-today
 * buckets -- the two windows that need doctor action now. "Tomorrow"/
 * "upcoming7" are intentionally NOT auto-queued: reminding a patient days
 * before they're actually due would be noise, not intelligence.
 */
export async function scheduleFollowUpReminders(referenceDate: Date = new Date()): Promise<ReminderQueueEntry[]> {
  const buckets = await getFollowUpBuckets(referenceDate);
  const candidates: Array<{ entry: FollowUpBucketEntry; isOverdue: boolean }> = [
    ...buckets.overdue.map((entry) => ({ entry, isOverdue: true })),
    ...buckets.today.map((entry) => ({ entry, isOverdue: false })),
  ];

  const created: ReminderQueueEntry[] = [];

  for (const { entry, isOverdue } of candidates) {
    if (!entry.phone) continue; // nothing to send to -- scheduling one would be dead weight
    const alreadyQueued = await hasActiveReminder(entry.patientId, "follow_up");
    if (alreadyQueued) continue;

    const reminder = await enqueueReminder({
      patientId: entry.patientId,
      patientName: entry.patientName,
      phone: entry.phone,
      type: "follow_up",
      message: buildFollowUpMessage(entry, isOverdue),
      dueAt: referenceDate.toISOString(),
      sourceRef: isOverdue ? "bucket:overdue" : "bucket:today",
    });
    created.push(reminder);
  }

  return created;
}
