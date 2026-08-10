/**
 * reminderSchedulerService.ts
 * Sakhi Clinic — Reminder Engine: scheduling (Phase 2, extended for
 * appointment reminders per REMINDER_SYSTEM_AUDIT.md).
 *
 * Single responsibility: decide WHEN a reminder should exist and enqueue
 * it. Two independent producers live here:
 *
 * - Follow-up reminders (scheduleFollowUpReminders): reuses
 *   followUpIntelligenceService.ts's buckets as its only data source,
 *   runs automatically on every periodic maintenance tick
 *   (reminderMaintenanceService.ts / maintenanceRuntimeService.ts) since
 *   overdue/due-today status is clinically time-sensitive.
 *
 * - Appointment reminders (getTodayAppointmentReminderCandidates /
 *   getThisWeekAppointmentReminderGroups / queueAppointmentReminders):
 *   reuses appointmentService.ts as its only data source. Deliberately
 *   NOT wired into the automatic maintenance tick -- unlike a follow-up's
 *   single nextFollowUpDate, a patient can have several appointments at
 *   once, and silently auto-queuing a reminder the moment any appointment
 *   is booked would be noise, not intelligence (the same reasoning this
 *   file already applies to excluding the "tomorrow"/"upcoming7"
 *   follow-up buckets from auto-scheduling). Appointment reminders are
 *   doctor-initiated from RemindersPage.tsx's Today/This Week sections.
 *
 * Both producers are idempotent via the exact same guard,
 * reminderQueueService's hasActiveReminder(patientId, type, sourceRef?) --
 * scoped by `type` so an active "appointment" reminder for a patient never
 * blocks (or is blocked by) an active "follow_up" one for the same patient.
 * Appointment reminders additionally scope by `sourceRef` (the specific
 * appointment) so a patient with multiple live appointments gets an
 * independent reminder per appointment instead of the first one queued
 * silently blocking the rest.
 */

import { getFollowUpBuckets, FollowUpBucketEntry } from "./followUpIntelligenceService";
import { enqueueReminder, hasActiveReminder } from "./reminderQueueService";
import { appointmentService } from "./appointmentService";
import { patientRepository } from "../repositories/patientRepository";
import { Appointment, Patient, ReminderQueueEntry } from "./db";
import { dateKey, startOfDay } from "../utils/dateOnly";

const CLINIC_NAME = "Sakhi Homeopathic Clinic";

// Exported for FollowUpPage.tsx's manual per-row "Send Reminder" action --
// same message a doctor would get automatically for overdue/due-today
// patients, reused rather than re-built, so a manual send and an
// automatic one never drift into two different message formats.
export function buildFollowUpMessage(entry: FollowUpBucketEntry, isOverdue: boolean): string {
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

// ============================================================
// Appointment reminders (doctor-initiated -- see file header).
// ============================================================

export interface AppointmentReminderCandidate {
  appointmentId: string;
  patientId: string;
  patientName: string;
  phone?: string;
  date: string; // bare "YYYY-MM-DD", same convention as Appointment.date
  time: string; // "HH:MM"
  clinic: string;
}

// Statuses an appointment can be in that still warrant a reminder --
// cancelled/done/missed appointments have nothing left to remind about.
const REMINDABLE_STATUSES = new Set(["booked", "arrived", "in-progress"]);

// One canonical appointment-reminder template, reused for both today's and
// this-week's queueing -- consolidates the three separate hardcoded
// templates that previously lived in AppointmentPage.tsx (see
// REMINDER_SYSTEM_AUDIT.md Phase 6) rather than adding a fourth. Matches
// buildFollowUpMessage's exact greeting/body shape for brand consistency.
export function buildAppointmentReminderMessage(candidate: AppointmentReminderCandidate, isToday: boolean): string {
  const greeting = `*${CLINIC_NAME}*`;
  const whenLine = isToday
    ? `Your appointment is today at ${candidate.time}.`
    : `This is a reminder for your upcoming appointment on ${new Date(candidate.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at ${candidate.time}.`;
  const body = `Dear ${candidate.patientName},\n\n${whenLine}\n🏥 ${candidate.clinic}\n\nPlease arrive on time 🙏`;
  return `${greeting}\n${body}`;
}

async function resolveReminderableAppointments(): Promise<Appointment[]> {
  const all = await appointmentService.getAll();
  return all.filter((a) => REMINDABLE_STATUSES.has(a.status));
}

function toCandidate(appointment: Appointment, patientById: Map<string, Patient>): AppointmentReminderCandidate {
  const patient = patientById.get(appointment.patientId);
  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    patientName: appointment.patientName || patient?.name || "Unknown Patient",
    phone: patient?.phone,
    date: appointment.date,
    time: appointment.time,
    clinic: appointment.clinic,
  };
}

/** Today's reminder-eligible appointments, earliest first. */
export async function getTodayAppointmentReminderCandidates(referenceDate: Date = new Date()): Promise<AppointmentReminderCandidate[]> {
  const todayKey = dateKey(referenceDate);
  const [appointments, patients] = await Promise.all([resolveReminderableAppointments(), patientRepository.list()]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  return appointments
    .filter((a) => a.date === todayKey)
    .map((a) => toCandidate(a, patientById))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export interface AppointmentReminderDayGroup {
  date: string; // "YYYY-MM-DD"
  label: string; // e.g. "Mon", "Tue"
  candidates: AppointmentReminderCandidate[];
}

/**
 * "This Week": a rolling window starting TOMORROW (today has its own
 * dedicated section/action -- see RemindersPage.tsx) through `days` days
 * out, grouped by calendar day. A rolling window rather than a
 * Monday-aligned calendar week, mirroring followUpIntelligenceService.ts's
 * own "upcoming7" bucket convention -- consistent with the one date-
 * grouping pattern this codebase already has, not a new one.
 */
export async function getThisWeekAppointmentReminderGroups(
  referenceDate: Date = new Date(),
  days: number = 7
): Promise<AppointmentReminderDayGroup[]> {
  const [appointments, patients] = await Promise.all([resolveReminderableAppointments(), patientRepository.list()]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const start = startOfDay(referenceDate);

  const groups: AppointmentReminderDayGroup[] = [];
  for (let i = 1; i <= days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    const key = dateKey(day);
    const dayAppointments = appointments
      .filter((a) => a.date === key)
      .map((a) => toCandidate(a, patientById))
      .sort((a, b) => a.time.localeCompare(b.time));
    groups.push({ date: key, label: day.toLocaleDateString(undefined, { weekday: "short" }), candidates: dayAppointments });
  }
  return groups;
}

export interface QueueAppointmentRemindersResult {
  queued: ReminderQueueEntry[];
  skippedDuplicate: number;
  skippedNoPhone: number;
}

/**
 * Queues (never sends) a reminder for each candidate, using
 * hasActiveReminder(patientId, "appointment", sourceRef) scoped to this
 * specific appointment -- so calling this twice in a row for the same
 * appointments queues nothing new the second time, but a patient with a
 * second, different appointment still gets its own independent reminder
 * rather than being silently blocked by the first one queued.
 * Candidates with no phone on file are counted, not queued (nothing to
 * send to); the caller surfaces both counts to the doctor.
 */
export async function queueAppointmentReminders(
  candidates: AppointmentReminderCandidate[],
  referenceDate: Date = new Date()
): Promise<QueueAppointmentRemindersResult> {
  const todayKey = dateKey(referenceDate);
  const queued: ReminderQueueEntry[] = [];
  let skippedDuplicate = 0;
  let skippedNoPhone = 0;

  for (const candidate of candidates) {
    if (!candidate.phone) {
      skippedNoPhone++;
      continue;
    }
    const sourceRef = `appointment:${candidate.appointmentId}`;
    const alreadyActive = await hasActiveReminder(candidate.patientId, "appointment", sourceRef);
    if (alreadyActive) {
      skippedDuplicate++;
      continue;
    }

    const reminder = await enqueueReminder({
      patientId: candidate.patientId,
      patientName: candidate.patientName,
      phone: candidate.phone,
      type: "appointment",
      message: buildAppointmentReminderMessage(candidate, candidate.date === todayKey),
      dueAt: new Date().toISOString(),
      sourceRef,
    });
    queued.push(reminder);
  }

  return { queued, skippedDuplicate, skippedNoPhone };
}
