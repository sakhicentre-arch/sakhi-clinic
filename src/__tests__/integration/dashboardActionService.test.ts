import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Doctor Action Dashboard (Module 1) data source. Every assertion pins a
 * fixed `REF` date -- getDashboardActionData buckets everything relative
 * to it, matching followUpIntelligenceService.test.ts's own convention.
 */

const DB_NAME = "SakhiClinicDB";
const REF = new Date(2026, 2, 15, 12, 0, 0); // local March 15, 2026 (Sunday)

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

let db: typeof import("../../services/db").db;
let svc: typeof import("../../services/dashboardActionService");

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function isoOnLocalDay(year: number, month: number, day: number, hour = 10): string {
  return new Date(year, month, day, hour).toISOString();
}

async function seedPatient(overrides: { id: string; name: string; nextFollowUpDate?: string; createdAt?: string }) {
  await db.patients.add({
    id: overrides.id, name: overrides.name, gender: "Female", phone: "9876543210",
    nextFollowUpDate: overrides.nextFollowUpDate,
    createdAt: overrides.createdAt || "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  } as any);
}

async function seedConsultation(overrides: { id: string; patientId: string; date: string; outcome?: string; followUpDate?: string }) {
  await db.consultations.add({
    id: overrides.id, patientId: overrides.patientId, date: overrides.date,
    clinicId: "Dabholi", chiefComplaint: "Test", caseText: "",
    outcome: overrides.outcome || "IMPROVED", medicines: [], followUpDate: overrides.followUpDate,
  } as any);
}

async function seedAppointment(overrides: { id: string; patientId: string; date: string; status: string }) {
  await db.appointments.add({
    id: overrides.id, patientId: overrides.patientId, patientName: "x", clinic: "Dabholi",
    date: overrides.date, time: "10:00", type: "scheduled", status: overrides.status,
  } as any);
}

describe("dashboardActionService", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/dashboardActionService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("todayFollowUps / overdueFollowUps reuse followUpIntelligenceService's own buckets", async () => {
    // getFollowUpBuckets only considers patients with at least one prior
    // consultation -- a never-seen patient has no follow-up concept yet.
    await seedPatient({ id: "p1", name: "Today Patient", nextFollowUpDate: ymd(2026, 2, 15) });
    await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 1, 15) });
    await seedPatient({ id: "p2", name: "Overdue Patient", nextFollowUpDate: ymd(2026, 2, 10) });
    await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 1, 10) });

    const data = await svc.getDashboardActionData(REF);
    expect(data.todayFollowUps.map((e) => e.patientId)).toEqual(["p1"]);
    expect(data.overdueFollowUps.map((e) => e.patientId)).toEqual(["p2"]);
    expect(data.overdueFollowUps[0].detail).toMatch(/5 days overdue/);
  });

  it("splits future follow-ups into thisWeek (days 1-7) and upcoming (days 8-14)", async () => {
    await seedPatient({ id: "p1", name: "This Week", nextFollowUpDate: ymd(2026, 2, 18) }); // +3 days
    await seedPatient({ id: "p2", name: "Next Week", nextFollowUpDate: ymd(2026, 2, 25) }); // +10 days
    await seedPatient({ id: "p3", name: "Too Far", nextFollowUpDate: ymd(2026, 3, 15) }); // +31 days -- neither bucket

    const data = await svc.getDashboardActionData(REF);
    expect(data.thisWeekFollowUps.map((e) => e.patientId)).toEqual(["p1"]);
    expect(data.upcomingFollowUps.map((e) => e.patientId)).toEqual(["p2"]);
  });

  it("missedPatients reflects a follow-up date that passed with no later consultation", async () => {
    await seedPatient({ id: "p1", name: "Missed Patient" });
    // A consultation from 20 days ago advised a follow-up 10 days ago; the patient never came back.
    await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 1, 23), followUpDate: ymd(2026, 2, 5) });

    const data = await svc.getDashboardActionData(REF);
    expect(data.missedPatients.map((e) => e.patientId)).toEqual(["p1"]);
  });

  it("newPatientsToday: registered today, by local calendar day", async () => {
    await seedPatient({ id: "p1", name: "New Today", createdAt: isoOnLocalDay(2026, 2, 15, 8) });
    await seedPatient({ id: "p2", name: "Registered Yesterday", createdAt: isoOnLocalDay(2026, 2, 14, 8) });

    const data = await svc.getDashboardActionData(REF);
    expect(data.newPatientsToday.map((e) => e.patientId)).toEqual(["p1"]);
  });

  it("repeatPatientsToday: today's consultations that are NOT a first visit", async () => {
    await seedPatient({ id: "p1", name: "Repeat" });
    await seedPatient({ id: "p2", name: "First Visit" });
    await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), outcome: "IMPROVED" });
    await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 2, 15), outcome: "FIRST_VISIT" });

    const data = await svc.getDashboardActionData(REF);
    expect(data.repeatPatientsToday.map((e) => e.patientId)).toEqual(["p1"]);
  });

  it("consultationsCompletedToday counts today's consultation records", async () => {
    await seedPatient({ id: "p1", name: "A" });
    await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15) });
    await seedConsultation({ id: "c2", patientId: "p1", date: isoOnLocalDay(2026, 2, 14) }); // yesterday, excluded

    const data = await svc.getDashboardActionData(REF);
    expect(data.consultationsCompletedToday).toBe(1);
  });

  it("consultationsPendingToday counts today's not-yet-seen appointments (booked/arrived/in-progress)", async () => {
    // Deliberately the REAL current date here, not the fixed REF used
    // elsewhere in this file: appointmentService.getAll() has its own
    // side effect (markOverdueAppointmentsMissed) keyed off the actual
    // system clock, not a reference-date parameter -- seeding "today's"
    // appointments against a fixed historical REF would let that side
    // effect silently flip them to "missed" before this test ever reads
    // them, since REF is in the past relative to real time.
    const realToday = new Date();
    const todayStr = ymd(realToday.getFullYear(), realToday.getMonth(), realToday.getDate());
    const yesterday = new Date(realToday);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = ymd(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    await seedPatient({ id: "p1", name: "A" });
    await seedAppointment({ id: "a1", patientId: "p1", date: todayStr, status: "booked" });
    await seedAppointment({ id: "a2", patientId: "p1", date: todayStr, status: "arrived" });
    await seedAppointment({ id: "a3", patientId: "p1", date: todayStr, status: "done" }); // already seen, excluded
    await seedAppointment({ id: "a4", patientId: "p1", date: todayStr, status: "cancelled" }); // excluded
    await seedAppointment({ id: "a5", patientId: "p1", date: yesterdayStr, status: "booked" }); // wrong day, excluded

    const data = await svc.getDashboardActionData(realToday);
    expect(data.consultationsPendingToday).toBe(2);
  });
});
