/**
 * reminderQueueService.ts
 * Sakhi Clinic — Reminder Engine: queue management (Phase 2).
 *
 * Single responsibility: CRUD over the reminderQueue table. Does not decide
 * WHEN a reminder should exist (reminderSchedulerService.ts) or actually
 * send anything (reminderDeliveryService.ts) -- this module only manages
 * the queue's state machine:
 *
 *   pending --approve--> approved --[delivery service sends]--> sent
 *      |                                                          |
 *      +--reject--> rejected                          [delivery service]--> failed
 *      |
 *      +--cancel--> cancelled
 *
 * Every outbound reminder requires an explicit doctor approval before it is
 * ever sent -- this is not optional workflow polish, it is the same
 * "AI/automation trust principle" already applied elsewhere in this
 * codebase (rubric/AI suggestions require doctor approval before they
 * affect the clinical record); it applies equally to any outbound patient
 * communication.
 */

import { db, ReminderQueueEntry, ReminderStatus, ReminderType, ReminderChannel } from "./db";
import { generateId } from "../utils/generateId";
import { logOperationalEvent } from "./operationalEventLogService";

const nowIso = () => new Date().toISOString();

export type EnqueueReminderInput = {
  id?: string;
  patientId: string;
  patientName: string;
  phone?: string;
  type: ReminderType;
  channel?: ReminderChannel;
  message: string;
  dueAt: string;
  sourceRef?: string;
};

export async function enqueueReminder(input: EnqueueReminderInput): Promise<ReminderQueueEntry> {
  const entry: ReminderQueueEntry = {
    id: input.id || generateId(),
    patientId: input.patientId,
    patientName: input.patientName,
    phone: input.phone,
    type: input.type,
    channel: input.channel || "whatsapp",
    message: input.message,
    dueAt: input.dueAt,
    status: "pending",
    sourceRef: input.sourceRef,
    retryCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await db.reminderQueue.put(entry);
  return entry;
}

export async function getReminderById(id: string): Promise<ReminderQueueEntry | undefined> {
  return db.reminderQueue.get(id);
}

export async function listRemindersByStatus(status: ReminderStatus): Promise<ReminderQueueEntry[]> {
  const rows = await db.reminderQueue.where("status").equals(status).toArray();
  return rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export async function listAllReminders(): Promise<ReminderQueueEntry[]> {
  const rows = await db.reminderQueue.toArray();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Has a patient already got a live (pending/approved) reminder of this type
 * queued? Used by the scheduler to stay idempotent -- it can run on every
 * maintenance tick without ever double-queuing the same follow-up.
 */
export async function hasActiveReminder(patientId: string, type: ReminderType): Promise<boolean> {
  const rows = await db.reminderQueue
    .where("patientId")
    .equals(patientId)
    .filter((r) => r.type === type && (r.status === "pending" || r.status === "approved"))
    .toArray();
  return rows.length > 0;
}

async function transition(id: string, status: ReminderStatus): Promise<ReminderQueueEntry | null> {
  const existing = await db.reminderQueue.get(id);
  if (!existing) return null;

  const updated: ReminderQueueEntry = { ...existing, status, updatedAt: nowIso() };
  await db.reminderQueue.put(updated);
  return updated;
}

export async function approveReminder(id: string): Promise<ReminderQueueEntry | null> {
  const updated = await transition(id, "approved");
  if (updated) {
    await logOperationalEvent({
      level: "info",
      type: "reminder.approved",
      message: "Reminder approved for sending",
      data: { reminderId: id, patientId: updated.patientId },
    }).catch(() => {});
  }
  return updated;
}

export async function rejectReminder(id: string): Promise<ReminderQueueEntry | null> {
  const updated = await transition(id, "rejected");
  if (updated) {
    await logOperationalEvent({
      level: "info",
      type: "reminder.rejected",
      message: "Reminder rejected by doctor",
      data: { reminderId: id, patientId: updated.patientId },
    }).catch(() => {});
  }
  return updated;
}

export async function cancelReminder(id: string): Promise<ReminderQueueEntry | null> {
  const updated = await transition(id, "cancelled");
  if (updated) {
    await logOperationalEvent({
      level: "info",
      type: "reminder.cancelled",
      message: "Reminder cancelled",
      data: { reminderId: id, patientId: updated.patientId },
    }).catch(() => {});
  }
  return updated;
}

/** Used internally by reminderDeliveryService.ts -- not a public workflow action. */
export async function setReminderStatus(id: string, status: ReminderStatus, patch?: Partial<ReminderQueueEntry>): Promise<ReminderQueueEntry | null> {
  const existing = await db.reminderQueue.get(id);
  if (!existing) return null;
  const updated: ReminderQueueEntry = { ...existing, ...patch, status, updatedAt: nowIso() };
  await db.reminderQueue.put(updated);
  return updated;
}
