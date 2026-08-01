/**
 * reminderDeliveryService.ts
 * Sakhi Clinic — Reminder Engine: delivery tracking (Phase 2).
 *
 * Single responsibility: perform the actual send (by reusing
 * whatsappService.ts's openWhatsApp -- no WhatsApp URL/window-handling
 * logic is duplicated here) and record what happened into reminderHistory.
 *
 * Honesty constraint: this app has no WhatsApp Business API integration
 * (see SAKHI_CLINIC_PRODUCTION_EXECUTION_ROADMAP_V2.md §7.4 and
 * PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md's Module 5 section) -- there is
 * no delivery receipt, no read receipt, no server-side send confirmation.
 * "Sent" here means "the doctor approved it and the app successfully
 * opened WhatsApp with the message pre-filled" -- a real, honest signal,
 * but not proof the message reached the patient's device. The UI must
 * never claim more than that.
 */

import { db, ReminderQueueEntry, ReminderHistoryEntry } from "./db";
import { generateId } from "../utils/generateId";
import { openWhatsApp } from "./whatsappService";
import { logOperationalEvent } from "./operationalEventLogService";
import { getReminderById, setReminderStatus } from "./reminderQueueService";

const nowIso = () => new Date().toISOString();

async function recordHistory(entry: ReminderQueueEntry, action: ReminderHistoryEntry["action"], note?: string): Promise<ReminderHistoryEntry> {
  const record: ReminderHistoryEntry = {
    id: generateId(),
    reminderId: entry.id,
    patientId: entry.patientId,
    patientName: entry.patientName,
    channel: entry.channel,
    action,
    message: entry.message,
    attemptedAt: nowIso(),
    note,
  };
  await db.reminderHistory.put(record);
  return record;
}

export type SendReminderResult =
  | { ok: true; historyEntry: ReminderHistoryEntry }
  | { ok: false; reason: string };

/**
 * Sends an approved reminder. Only "approved" entries may be sent -- a
 * doctor must have explicitly reviewed it first (reminderQueueService's
 * approveReminder). Attempting to send a "pending" entry is rejected, not
 * silently allowed, so this can never become a backdoor around approval.
 */
export async function sendReminder(id: string): Promise<SendReminderResult> {
  const entry = await getReminderById(id);
  if (!entry) return { ok: false, reason: "Reminder not found" };
  if (entry.status !== "approved") {
    return { ok: false, reason: `Reminder must be approved before sending (current status: ${entry.status})` };
  }
  if (!entry.phone) {
    await markReminderFailed(id, "No phone number on file for this patient");
    return { ok: false, reason: "No phone number on file for this patient" };
  }

  try {
    const opened = openWhatsApp({ phone: entry.phone, message: entry.message });
    if (!opened) {
      await markReminderFailed(id, "Could not open WhatsApp");
      return { ok: false, reason: "Could not open WhatsApp" };
    }

    const historyEntry = await recordHistory(entry, "sent");
    await setReminderStatus(id, "sent");
    await logOperationalEvent({
      level: "info",
      type: "reminder.sent",
      message: "Reminder sent via WhatsApp (doctor-confirmed send, no delivery receipt available)",
      data: { reminderId: id, patientId: entry.patientId },
    }).catch(() => {});

    return { ok: true, historyEntry };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markReminderFailed(id, message);
    return { ok: false, reason: message };
  }
}

export async function markReminderFailed(id: string, reason: string): Promise<ReminderHistoryEntry | null> {
  const entry = await getReminderById(id);
  if (!entry) return null;

  const historyEntry = await recordHistory(entry, "failed", reason);
  await setReminderStatus(id, "failed");
  await logOperationalEvent({
    level: "warn",
    type: "reminder.failed",
    message: "Reminder send failed",
    data: { reminderId: id, patientId: entry.patientId, reason },
  }).catch(() => {});

  return historyEntry;
}

/**
 * Resend a failed (or already-sent) reminder: moves it back to "approved"
 * and re-attempts the send immediately. Distinct from the maintenance
 * runtime's automatic retry (reminderMaintenanceService.ts), which only
 * ever resurfaces a failed reminder to "pending" for the doctor to
 * re-approve -- this function is the explicit, doctor-initiated action
 * from the Reminders UI's "Resend" button.
 */
export async function resendReminder(id: string): Promise<SendReminderResult> {
  const entry = await getReminderById(id);
  if (!entry) return { ok: false, reason: "Reminder not found" };

  await setReminderStatus(id, "approved");
  return sendReminder(id);
}

export async function getReminderHistory(limit = 100): Promise<ReminderHistoryEntry[]> {
  const rows = await db.reminderHistory.orderBy("attemptedAt").toArray();
  return rows.slice(-Math.max(0, limit)).reverse();
}

export async function getPatientReminderHistory(patientId: string): Promise<ReminderHistoryEntry[]> {
  const all = await getReminderHistory(10_000);
  return all.filter((h) => h.patientId === patientId);
}
