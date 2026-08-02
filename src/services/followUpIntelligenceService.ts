/**
 * followUpIntelligenceService.ts
 * Sakhi Clinic — Follow-up Intelligence Dashboard (Phase 1).
 *
 * Builds on the existing data model rather than inventing a new one: there
 * is no separate "follow-up" entity in this schema. A follow-up is either
 * the patient's current `nextFollowUpDate` (real-time bucketing: overdue,
 * due today, etc.) or, historically, a `Consultation.followUpDate` that a
 * later consultation did or didn't arrive on time for (derived history:
 * completed vs missed). Both fields already exist and are already written
 * by patientService.ts/consultationService.ts -- this module only reads
 * and aggregates them.
 *
 * Alerting reuses followupEngine.ts's getFollowUpAlerts() as the base
 * (DUE/OVERDUE/HIGH_RISK) and layers dashboard-specific alert types on top
 * rather than reimplementing that logic.
 */

import { db, Patient, Consultation } from "./db";
import { getAllConsultations } from "./consultationService";
import { getFollowUpAlerts, FollowUpAlert } from "./followupEngine";
import { parseDateOnly, startOfDay, daysBetween, dateKey, monthKey, isoWeekStart } from "../utils/dateOnly";

export type FollowUpBucketKey = "overdue" | "today" | "tomorrow" | "upcoming7" | "noDate";

export interface FollowUpBucketEntry {
  patientId: string;
  patientName: string;
  phone?: string;
  nextFollowUpDate?: string;
  daysOverdue?: number;
  isChronic: boolean;
  lastVisit?: string;
}

export type FollowUpBuckets = Record<FollowUpBucketKey, FollowUpBucketEntry[]>;

export type FollowUpHistoryStatus = "completed" | "missed" | "pending";

export interface FollowUpHistoryEntry {
  patientId: string;
  patientName: string;
  consultationId: string;
  consultationDate: string;
  followUpDate: string;
  status: FollowUpHistoryStatus;
  actualReturnDate?: string;
  daysLate?: number;
}

export interface FollowUpAnalytics {
  generatedAt: string;
  dailyWorkload: Array<{ date: string; label: string; count: number }>;
  completionRate: number; // 0-100, over resolved (completed+missed) history
  pendingCount: number;
  overdueCount: number;
  completedCount: number;
  missedCount: number;
  weeklyTrend: Array<{ weekStart: string; completed: number; missed: number }>;
  monthlyTrend: Array<{ month: string; completed: number; missed: number }>;
}

export type IntelligentAlertType =
  | FollowUpAlert["type"]
  | "CHRONIC_OVERDUE"
  | "LONG_GAP"
  | "MISSED_RECURRING";

export interface IntelligentAlert {
  patientId: string;
  patientName: string;
  phone?: string;
  type: IntelligentAlertType;
  message: string;
  severity: number;
}

const LONG_GAP_DAYS = 60;
const RECURRING_MISS_THRESHOLD = 2;

// startOfDay/daysBetween/dateKey/parseDateOnly/isoWeekStart/monthKey now
// live in ../utils/dateOnly.ts (shared with paymentService.ts) -- see that
// file's own comment for the local-calendar-date parsing rule this module
// depends on throughout.

async function loadData(): Promise<{ patients: Patient[]; consultations: Consultation[] }> {
  const [patients, consultations] = await Promise.all([
    db.patients.filter((p) => !p.deletedAt).toArray(),
    getAllConsultations(),
  ]);
  return { patients, consultations };
}

function groupConsultationsByPatient(consultations: Consultation[]): Map<string, Consultation[]> {
  const map = new Map<string, Consultation[]>();
  for (const c of consultations) {
    const list = map.get(c.patientId) || [];
    list.push(c);
    map.set(c.patientId, list);
  }
  map.forEach((list) => list.sort((a, b) => a.date.localeCompare(b.date)));
  return map;
}

/**
 * Real-time bucketing of patients by their current nextFollowUpDate.
 */
export async function getFollowUpBuckets(referenceDate: Date = new Date()): Promise<FollowUpBuckets> {
  const { patients, consultations } = await loadData();
  const byPatient = groupConsultationsByPatient(consultations);

  const today = startOfDay(referenceDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const buckets: FollowUpBuckets = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming7: [],
    noDate: [],
  };

  for (const patient of patients) {
    const history = byPatient.get(patient.id) || [];
    if (history.length === 0) continue; // never seen -- not a follow-up candidate

    const lastConsultation = history[history.length - 1];
    const isChronic = history.some((c) => c.caseType === "chronic");

    const entry: FollowUpBucketEntry = {
      patientId: patient.id,
      patientName: patient.name,
      phone: patient.phone,
      nextFollowUpDate: patient.nextFollowUpDate || undefined,
      isChronic,
      lastVisit: patient.lastVisit || lastConsultation.date,
    };

    if (!patient.nextFollowUpDate) {
      buckets.noDate.push(entry);
      continue;
    }

    const due = startOfDay(parseDateOnly(patient.nextFollowUpDate));
    if (due.getTime() < today.getTime()) {
      buckets.overdue.push({ ...entry, daysOverdue: daysBetween(due, today) });
    } else if (due.getTime() === today.getTime()) {
      buckets.today.push(entry);
    } else if (due.getTime() === tomorrow.getTime()) {
      buckets.tomorrow.push(entry);
    } else if (due.getTime() <= weekEnd.getTime()) {
      buckets.upcoming7.push(entry);
    }
  }

  (Object.keys(buckets) as FollowUpBucketKey[]).forEach((key) => {
    if (key === "overdue") {
      buckets[key].sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
    } else {
      buckets[key].sort((a, b) => (a.nextFollowUpDate || "").localeCompare(b.nextFollowUpDate || ""));
    }
  });

  return buckets;
}

/**
 * Derived, historical follow-up compliance: for every consultation that
 * set a followUpDate, did a later consultation for the same patient occur
 * on or after that date?
 */
export async function getFollowUpHistory(referenceDate: Date = new Date()): Promise<FollowUpHistoryEntry[]> {
  const { patients, consultations } = await loadData();
  const byPatient = groupConsultationsByPatient(consultations);
  const patientNames = new Map(patients.map((p) => [p.id, p.name]));
  const today = startOfDay(referenceDate);

  const entries: FollowUpHistoryEntry[] = [];

  byPatient.forEach((history, patientId) => {
    const patientName = patientNames.get(patientId) || "Unknown";

    history.forEach((c, index) => {
      if (!c.followUpDate) return;

      const followUpDue = startOfDay(parseDateOnly(c.followUpDate));
      const nextVisit = history.slice(index + 1).find((later) => new Date(later.date) >= followUpDue);

      let status: FollowUpHistoryStatus;
      let actualReturnDate: string | undefined;
      let daysLate: number | undefined;

      if (nextVisit) {
        status = "completed";
        actualReturnDate = nextVisit.date;
        daysLate = Math.max(0, daysBetween(followUpDue, startOfDay(new Date(nextVisit.date))));
      } else if (followUpDue.getTime() < today.getTime()) {
        status = "missed";
      } else {
        status = "pending";
      }

      entries.push({
        patientId,
        patientName,
        consultationId: c.id,
        consultationDate: c.date,
        followUpDate: c.followUpDate,
        status,
        actualReturnDate,
        daysLate,
      });
    });
  });

  return entries.sort((a, b) => b.followUpDate.localeCompare(a.followUpDate));
}

/**
 * Follow-up timeline for a single patient -- same derivation, scoped to
 * one patient, for display alongside PatientHistoryTimeline.
 */
export async function getPatientFollowUpTimeline(patientId: string, referenceDate: Date = new Date()): Promise<FollowUpHistoryEntry[]> {
  const all = await getFollowUpHistory(referenceDate);
  return all.filter((e) => e.patientId === patientId).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
}

export async function getFollowUpAnalytics(referenceDate: Date = new Date()): Promise<FollowUpAnalytics> {
  const [buckets, history] = await Promise.all([
    getFollowUpBuckets(referenceDate),
    getFollowUpHistory(referenceDate),
  ]);

  const today = startOfDay(referenceDate);

  // Daily workload: how many follow-ups are due on each of the next 7 days.
  const dailyWorkload: FollowUpAnalytics["dailyWorkload"] = [];
  const allUpcoming = [...buckets.today, ...buckets.tomorrow, ...buckets.upcoming7];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const count = allUpcoming.filter((e) => e.nextFollowUpDate && dateKey(startOfDay(parseDateOnly(e.nextFollowUpDate))) === key).length;
    dailyWorkload.push({
      date: key,
      label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
      count,
    });
  }

  const completed = history.filter((h) => h.status === "completed");
  const missed = history.filter((h) => h.status === "missed");
  const resolved = completed.length + missed.length;
  const completionRate = resolved > 0 ? Math.round((completed.length / resolved) * 100) : 0;

  const pendingCount = buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.upcoming7.length;
  const overdueCount = buckets.overdue.length;

  // Weekly trend: last 8 ISO weeks.
  const weeklyMap = new Map<string, { completed: number; missed: number }>();
  for (const h of [...completed, ...missed]) {
    // actualReturnDate is a full ISO timestamp (consultation.date);
    // followUpDate is a bare "YYYY-MM-DD" -- each needs its own parser.
    const refDate = h.status === "completed" ? new Date(h.actualReturnDate!) : parseDateOnly(h.followUpDate);
    const week = isoWeekStart(refDate);
    const bucket = weeklyMap.get(week) || { completed: 0, missed: 0 };
    if (h.status === "completed") bucket.completed++;
    else bucket.missed++;
    weeklyMap.set(week, bucket);
  }
  const weeklyTrend = Array.from(weeklyMap.entries())
    .map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-8);

  // Monthly trend: last 6 months.
  const monthlyMap = new Map<string, { completed: number; missed: number }>();
  for (const h of [...completed, ...missed]) {
    const refDate = h.status === "completed" ? new Date(h.actualReturnDate!) : parseDateOnly(h.followUpDate);
    const month = monthKey(refDate);
    const bucket = monthlyMap.get(month) || { completed: 0, missed: 0 };
    if (h.status === "completed") bucket.completed++;
    else bucket.missed++;
    monthlyMap.set(month, bucket);
  }
  const monthlyTrend = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return {
    generatedAt: new Date().toISOString(),
    dailyWorkload,
    completionRate,
    pendingCount,
    overdueCount,
    completedCount: completed.length,
    missedCount: missed.length,
    weeklyTrend,
    monthlyTrend,
  };
}

/**
 * Intelligent alerts: the base DUE/OVERDUE/HIGH_RISK set from
 * followupEngine.ts, plus three dashboard-specific patterns that need the
 * bucket/history views this module already computes.
 */
export async function getIntelligentAlerts(referenceDate: Date = new Date()): Promise<IntelligentAlert[]> {
  const [baseAlerts, buckets, history] = await Promise.all([
    getFollowUpAlerts(),
    getFollowUpBuckets(referenceDate),
    getFollowUpHistory(referenceDate),
  ]);

  const alerts: IntelligentAlert[] = baseAlerts.map((a) => ({ ...a }));
  const today = startOfDay(referenceDate);

  // Chronic patients overdue -- overdue bucket entries flagged chronic.
  for (const entry of buckets.overdue) {
    if (!entry.isChronic) continue;
    alerts.push({
      patientId: entry.patientId,
      patientName: entry.patientName,
      phone: entry.phone,
      type: "CHRONIC_OVERDUE",
      message: `Chronic case overdue for follow-up (${entry.daysOverdue} day${entry.daysOverdue === 1 ? "" : "s"})`,
      severity: 4,
    });
  }

  // Long-gap patients: last visit was a long time ago and nothing is scheduled.
  for (const entry of buckets.noDate) {
    if (!entry.lastVisit) continue;
    const gap = daysBetween(startOfDay(new Date(entry.lastVisit)), today);
    if (gap >= LONG_GAP_DAYS) {
      alerts.push({
        patientId: entry.patientId,
        patientName: entry.patientName,
        phone: entry.phone,
        type: "LONG_GAP",
        message: `No visit or follow-up scheduled in ${gap} days`,
        severity: 2,
      });
    }
  }

  // Missed recurring visits: 2+ missed follow-ups in derived history.
  const missedCounts = new Map<string, { count: number; patientName: string; phone?: string }>();
  for (const h of history) {
    if (h.status !== "missed") continue;
    const current = missedCounts.get(h.patientId) || { count: 0, patientName: h.patientName };
    current.count++;
    missedCounts.set(h.patientId, current);
  }
  missedCounts.forEach((v, patientId) => {
    if (v.count < RECURRING_MISS_THRESHOLD) return;
    alerts.push({
      patientId,
      patientName: v.patientName,
      type: "MISSED_RECURRING",
      message: `${v.count} follow-ups missed historically -- recurring non-attendance`,
      severity: 3,
    });
  });

  return alerts.sort((a, b) => b.severity - a.severity);
}
