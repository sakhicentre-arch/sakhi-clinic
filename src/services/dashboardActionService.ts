/**
 * dashboardActionService.ts
 * Sakhi Clinic — Doctor Action Dashboard (Module 1) data source.
 *
 * The Doctor Action Dashboard is explicitly NOT a statistics dashboard --
 * every card is a doorway into a workflow. This service computes the
 * specific patient sets each card needs, entirely by reusing existing
 * services (followUpIntelligenceService.ts, paymentService.ts,
 * consultationService.ts, patientRepository.ts, appointmentService.ts) --
 * it introduces zero new data-access logic, only new aggregation shapes
 * on top of what already exists. DashboardPage.tsx converts these into
 * FilteredPatientList entries; this file stays presentation-agnostic.
 */

import { getAllConsultations } from "./consultationService";
import { appointmentService } from "./appointmentService";
import { patientRepository } from "../repositories/patientRepository";
import { getFollowUpBuckets, getFollowUpHistory } from "./followUpIntelligenceService";
import { listRemindersByStatus } from "./reminderQueueService";
import { getOutstandingPatients } from "./paymentService";
import { ConsultationOutcome, normalizeOutcome, Patient } from "./db";
import { parseDateOnly, startOfDay, daysBetween, isSameLocalDay } from "../utils/dateOnly";

export interface DashboardPatientRef {
  patientId: string;
  name: string;
  phone?: string;
  detail: string;
}

export interface DashboardActionData {
  todayFollowUps: DashboardPatientRef[];
  overdueFollowUps: DashboardPatientRef[];
  thisWeekFollowUps: DashboardPatientRef[];
  upcomingFollowUps: DashboardPatientRef[];
  missedPatients: DashboardPatientRef[];
  newPatientsToday: DashboardPatientRef[];
  repeatPatientsToday: DashboardPatientRef[];
  pendingReminders: DashboardPatientRef[];
  pendingPayments: DashboardPatientRef[];
  consultationsCompletedToday: number;
  consultationsPendingToday: number;
  /** Total appointments booked for referenceDate, any status -- distinct
   * from consultationsPendingToday (a status-filtered subset of this). */
  todaysAppointmentsCount: number;
}

function toRef(p: Pick<Patient, "id" | "name" | "phone">, detail: string): DashboardPatientRef {
  return { patientId: p.id, name: p.name, phone: p.phone, detail };
}

export async function getDashboardActionData(referenceDate: Date = new Date()): Promise<DashboardActionData> {
  const [patients, consultations, appointments, buckets, history, pendingReminderEntries, approvedReminderEntries, outstandingPatients] = await Promise.all([
    patientRepository.list(),
    getAllConsultations(),
    appointmentService.getAll(),
    getFollowUpBuckets(referenceDate),
    getFollowUpHistory(referenceDate),
    listRemindersByStatus("pending"),
    listRemindersByStatus("approved"),
    getOutstandingPatients(),
  ]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const today = startOfDay(referenceDate);

  const todayFollowUps = buckets.today.map((e) =>
    toRef({ id: e.patientId, name: e.patientName, phone: patientById.get(e.patientId)?.phone }, "Follow-up due today")
  );
  const overdueFollowUps = buckets.overdue.map((e) =>
    toRef({ id: e.patientId, name: e.patientName, phone: patientById.get(e.patientId)?.phone }, `${e.daysOverdue} day${e.daysOverdue === 1 ? "" : "s"} overdue`)
  );

  // "This Week" / "Upcoming" are a finer split than followUpIntelligenceService's
  // own tomorrow/upcoming7 buckets (see this file's own header) -- computed
  // directly from Patient.nextFollowUpDate rather than widening that
  // service's bucket shape, which other callers (FollowUpPage.tsx) already
  // depend on as-is.
  const thisWeekFollowUps: DashboardPatientRef[] = [];
  const upcomingFollowUps: DashboardPatientRef[] = [];
  for (const p of patients) {
    if (!p.nextFollowUpDate) continue;
    const due = startOfDay(parseDateOnly(p.nextFollowUpDate));
    const daysAhead = daysBetween(today, due);
    if (daysAhead >= 1 && daysAhead <= 7) {
      thisWeekFollowUps.push(toRef(p, `Due ${due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`));
    } else if (daysAhead >= 8 && daysAhead <= 14) {
      upcomingFollowUps.push(toRef(p, `Due ${due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`));
    }
  }

  // Missed: a follow-up whose advised date passed with no later consultation
  // -- exactly what followUpIntelligenceService.getFollowUpHistory() already
  // derives (status "missed"), deduplicated to one entry per patient (most
  // recent miss) since the dashboard card is "which patients", not "which
  // individual missed follow-ups."
  const missedByPatient = new Map<string, DashboardPatientRef>();
  for (const h of history) {
    if (h.status !== "missed") continue;
    const p = patientById.get(h.patientId);
    if (!p) continue;
    const existing = missedByPatient.get(h.patientId);
    if (!existing || (h.daysLate || 0) > 0) {
      missedByPatient.set(h.patientId, toRef(p, `Missed follow-up advised for ${parseDateOnly(h.followUpDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`));
    }
  }

  const newPatientsToday = patients
    .filter((p) => p.createdAt && isSameLocalDay(p.createdAt, referenceDate))
    .map((p) => toRef(p, "Registered today"));

  const todaysConsultations = consultations.filter((c) => c.date && isSameLocalDay(c.date, referenceDate));
  const repeatPatientsToday = todaysConsultations
    .filter((c) => normalizeOutcome(c.outcome) !== ConsultationOutcome.FIRST_VISIT)
    .map((c) => {
      const p = patientById.get(c.patientId);
      return p ? toRef(p, "Repeat visit today") : null;
    })
    .filter((r): r is DashboardPatientRef => r !== null);

  const todaysAppointments = appointments.filter((a) => a.date && isSameLocalDay(a.date, referenceDate));
  const consultationsPendingToday = todaysAppointments.filter((a) => a.status === "booked" || a.status === "arrived" || a.status === "in-progress").length;

  // Pending WhatsApp Reminders: queued (pending) or doctor-approved but not
  // yet sent -- both still need action. Deduplicated to one row per patient
  // (a patient can have more than one queued reminder) since the card is
  // "which patients", matching missedPatients' own convention.
  const pendingByPatient = new Map<string, { count: number; name: string; phone?: string; latestType: string }>();
  for (const r of [...pendingReminderEntries, ...approvedReminderEntries]) {
    const existing = pendingByPatient.get(r.patientId) || { count: 0, name: r.patientName, phone: r.phone, latestType: r.type };
    existing.count += 1;
    pendingByPatient.set(r.patientId, existing);
  }
  const pendingReminders: DashboardPatientRef[] = Array.from(pendingByPatient.entries()).map(([patientId, v]) =>
    toRef({ id: patientId, name: v.name, phone: v.phone }, `${v.count} reminder${v.count === 1 ? "" : "s"} awaiting send (${v.latestType.replace(/_/g, " ")})`)
  );

  // Pending Payments: same all-time outstanding backlog the Payment
  // Dashboard's own cards drill into -- paymentService.ts is the single
  // source of truth for what "outstanding" means, not recomputed here.
  const pendingPayments: DashboardPatientRef[] = outstandingPatients.map((o) =>
    toRef({ id: o.patientId, name: o.name, phone: o.phone }, `₹${o.amount.toLocaleString("en-IN")} outstanding across ${o.consultationCount} visit${o.consultationCount === 1 ? "" : "s"}`)
  );

  return {
    todayFollowUps,
    overdueFollowUps,
    thisWeekFollowUps,
    upcomingFollowUps,
    missedPatients: Array.from(missedByPatient.values()),
    pendingReminders,
    pendingPayments,
    newPatientsToday,
    repeatPatientsToday,
    consultationsCompletedToday: todaysConsultations.length,
    consultationsPendingToday,
    todaysAppointmentsCount: todaysAppointments.length,
  };
}
