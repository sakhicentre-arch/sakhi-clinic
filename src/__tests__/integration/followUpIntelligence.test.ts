import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Phase 1 — Follow-up Intelligence Dashboard.
 *
 * All assertions pin a fixed `referenceDate` (2026-03-15) rather than
 * `new Date()`, so the test is deterministic regardless of when it runs --
 * every exported function in followUpIntelligenceService.ts accepts this
 * as an explicit parameter for exactly this reason.
 */

const DB_NAME = "SakhiClinicDB";
const REF = new Date("2026-03-15T12:00:00.000Z");

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

let db: typeof import("../../services/db").db;
let svc: typeof import("../../services/followUpIntelligenceService");

async function seedPatient(overrides: Record<string, any>) {
  await db.patients.add({
    id: overrides.id,
    name: overrides.name,
    gender: "Female",
    phone: overrides.phone || "9876543210",
    nextFollowUpDate: overrides.nextFollowUpDate,
    lastVisit: overrides.lastVisit,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as any);
}

async function seedConsultation(overrides: Record<string, any>) {
  await db.consultations.add({
    id: overrides.id,
    patientId: overrides.patientId,
    date: overrides.date,
    clinicId: "Dabholi",
    chiefComplaint: "Test complaint",
    caseText: "",
    caseType: overrides.caseType,
    followUpDate: overrides.followUpDate,
  } as any);
}

describe("Follow-up Intelligence Dashboard (Phase 1)", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/followUpIntelligenceService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  describe("getFollowUpBuckets", () => {
    it("buckets patients by nextFollowUpDate relative to the reference date", async () => {
      await seedPatient({ id: "P-OVERDUE", name: "Overdue Patient", nextFollowUpDate: "2026-03-10" });
      await seedConsultation({ id: "C-OVERDUE", patientId: "P-OVERDUE", date: "2026-02-10" });

      await seedPatient({ id: "P-TODAY", name: "Today Patient", nextFollowUpDate: "2026-03-15" });
      await seedConsultation({ id: "C-TODAY", patientId: "P-TODAY", date: "2026-02-15" });

      await seedPatient({ id: "P-TOMORROW", name: "Tomorrow Patient", nextFollowUpDate: "2026-03-16" });
      await seedConsultation({ id: "C-TOMORROW", patientId: "P-TOMORROW", date: "2026-02-16" });

      await seedPatient({ id: "P-WEEK", name: "Next Week Patient", nextFollowUpDate: "2026-03-20" });
      await seedConsultation({ id: "C-WEEK", patientId: "P-WEEK", date: "2026-02-20" });

      await seedPatient({ id: "P-FAR", name: "Far Future Patient", nextFollowUpDate: "2026-04-15" });
      await seedConsultation({ id: "C-FAR", patientId: "P-FAR", date: "2026-02-15" });

      await seedPatient({ id: "P-NODATE", name: "No Date Patient" });
      await seedConsultation({ id: "C-NODATE", patientId: "P-NODATE", date: "2026-02-15" });

      // Never actually seen -- must not appear in any bucket.
      await seedPatient({ id: "P-NEVERSEEN", name: "Never Seen Patient", nextFollowUpDate: "2026-03-10" });

      const buckets = await svc.getFollowUpBuckets(REF);

      expect(buckets.overdue.map((e) => e.patientId)).toEqual(["P-OVERDUE"]);
      expect(buckets.overdue[0].daysOverdue).toBe(5);
      expect(buckets.today.map((e) => e.patientId)).toEqual(["P-TODAY"]);
      expect(buckets.tomorrow.map((e) => e.patientId)).toEqual(["P-TOMORROW"]);
      expect(buckets.upcoming7.map((e) => e.patientId)).toEqual(["P-WEEK"]);
      expect(buckets.noDate.map((e) => e.patientId)).toEqual(["P-NODATE"]);

      // Far-future date (beyond the 7-day window) belongs in none of the buckets.
      const allBucketed = Object.values(buckets).flat().map((e) => e.patientId);
      expect(allBucketed).not.toContain("P-FAR");
      expect(allBucketed).not.toContain("P-NEVERSEEN");
    });

    it("flags a patient as chronic when any of their consultations used caseType chronic", async () => {
      await seedPatient({ id: "P-CHRONIC", name: "Chronic Patient", nextFollowUpDate: "2026-03-10" });
      await seedConsultation({ id: "C-CHRONIC-1", patientId: "P-CHRONIC", date: "2026-01-10", caseType: "chronic" });
      await seedConsultation({ id: "C-CHRONIC-2", patientId: "P-CHRONIC", date: "2026-02-10", caseType: "acute" });

      const buckets = await svc.getFollowUpBuckets(REF);
      expect(buckets.overdue[0].isChronic).toBe(true);
    });
  });

  describe("getFollowUpHistory", () => {
    it("marks a follow-up completed when a later consultation occurred on or after the due date", async () => {
      await seedPatient({ id: "P-COMPLETED", name: "Completed Patient" });
      await seedConsultation({ id: "C1", patientId: "P-COMPLETED", date: "2026-01-01", followUpDate: "2026-01-15" });
      await seedConsultation({ id: "C2", patientId: "P-COMPLETED", date: "2026-01-18" }); // returned 3 days late

      const history = await svc.getFollowUpHistory(REF);
      const entry = history.find((h) => h.consultationId === "C1");
      expect(entry?.status).toBe("completed");
      expect(entry?.actualReturnDate).toBe("2026-01-18");
      expect(entry?.daysLate).toBe(3);
    });

    it("marks a follow-up missed when the due date has passed with no later visit", async () => {
      await seedPatient({ id: "P-MISSED", name: "Missed Patient" });
      await seedConsultation({ id: "C1", patientId: "P-MISSED", date: "2026-01-01", followUpDate: "2026-01-15" });

      const history = await svc.getFollowUpHistory(REF); // REF is 2026-03-15, well past due
      const entry = history.find((h) => h.consultationId === "C1");
      expect(entry?.status).toBe("missed");
      expect(entry?.actualReturnDate).toBeUndefined();
    });

    it("marks a follow-up pending when the due date has not yet arrived", async () => {
      await seedPatient({ id: "P-PENDING", name: "Pending Patient" });
      await seedConsultation({ id: "C1", patientId: "P-PENDING", date: "2026-03-01", followUpDate: "2026-03-20" });

      const history = await svc.getFollowUpHistory(REF); // REF is 2026-03-15, before due
      const entry = history.find((h) => h.consultationId === "C1");
      expect(entry?.status).toBe("pending");
    });
  });

  describe("getFollowUpAnalytics", () => {
    it("computes completion rate only over resolved (completed + missed) history", async () => {
      await seedPatient({ id: "P1", name: "P1" });
      await seedConsultation({ id: "C1", patientId: "P1", date: "2026-01-01", followUpDate: "2026-01-10" });
      await seedConsultation({ id: "C1B", patientId: "P1", date: "2026-01-12" }); // completed

      await seedPatient({ id: "P2", name: "P2" });
      await seedConsultation({ id: "C2", patientId: "P2", date: "2026-01-01", followUpDate: "2026-01-10" }); // missed, no return

      await seedPatient({ id: "P3", name: "P3" });
      await seedConsultation({ id: "C3", patientId: "P3", date: "2026-03-01", followUpDate: "2026-03-20" }); // pending, excluded

      const analytics = await svc.getFollowUpAnalytics(REF);
      expect(analytics.completedCount).toBe(1);
      expect(analytics.missedCount).toBe(1);
      expect(analytics.completionRate).toBe(50);
    });

    it("counts daily workload for the next 7 days from current nextFollowUpDate buckets", async () => {
      await seedPatient({ id: "P-TODAY", name: "Today", nextFollowUpDate: "2026-03-15" });
      await seedConsultation({ id: "C-T", patientId: "P-TODAY", date: "2026-02-15" });

      const analytics = await svc.getFollowUpAnalytics(REF);
      const todayEntry = analytics.dailyWorkload.find((d) => d.date === "2026-03-15");
      expect(todayEntry?.count).toBe(1);
    });
  });

  describe("getIntelligentAlerts", () => {
    it("raises CHRONIC_OVERDUE for an overdue chronic patient", async () => {
      await seedPatient({ id: "P-CO", name: "Chronic Overdue", nextFollowUpDate: "2026-03-01" });
      await seedConsultation({ id: "C-CO", patientId: "P-CO", date: "2026-01-01", caseType: "chronic" });

      const alerts = await svc.getIntelligentAlerts(REF);
      expect(alerts.some((a) => a.type === "CHRONIC_OVERDUE" && a.patientId === "P-CO")).toBe(true);
    });

    it("raises LONG_GAP for a patient with no follow-up set and a stale last visit", async () => {
      await seedPatient({ id: "P-GAP", name: "Long Gap Patient", lastVisit: "2026-01-01" }); // 73 days before REF
      await seedConsultation({ id: "C-GAP", patientId: "P-GAP", date: "2026-01-01" });

      const alerts = await svc.getIntelligentAlerts(REF);
      expect(alerts.some((a) => a.type === "LONG_GAP" && a.patientId === "P-GAP")).toBe(true);
    });

    it("raises MISSED_RECURRING for a patient with 2+ missed follow-ups historically", async () => {
      // Any later visit resolves an earlier pending follow-up (a late
      // return still counts as "completed"), so getting two genuinely
      // independent misses from one patient needs two follow-up deadlines
      // that no subsequent visit ever reaches -- here, C-R3 (the final
      // visit) comes before both C-R1's and C-R2's due dates, so neither
      // is ever fulfilled.
      await seedPatient({ id: "P-REC", name: "Recurring Misser" });
      await seedConsultation({ id: "C-R1", patientId: "P-REC", date: "2026-01-01", followUpDate: "2026-01-30" });
      await seedConsultation({ id: "C-R2", patientId: "P-REC", date: "2026-01-05", followUpDate: "2026-01-10" });
      await seedConsultation({ id: "C-R3", patientId: "P-REC", date: "2026-01-08" });

      const history = await svc.getFollowUpHistory(REF);
      const missedForPatient = history.filter((h) => h.patientId === "P-REC" && h.status === "missed");
      expect(missedForPatient.length).toBeGreaterThanOrEqual(2);

      const alerts = await svc.getIntelligentAlerts(REF);
      expect(alerts.some((a) => a.type === "MISSED_RECURRING" && a.patientId === "P-REC")).toBe(true);
    });

    it("does not raise LONG_GAP or MISSED_RECURRING for a healthy, on-track patient", async () => {
      await seedPatient({ id: "P-OK", name: "Healthy Patient", nextFollowUpDate: "2026-03-20", lastVisit: "2026-03-01" });
      await seedConsultation({ id: "C-OK1", patientId: "P-OK", date: "2026-01-01", followUpDate: "2026-01-15" });
      await seedConsultation({ id: "C-OK2", patientId: "P-OK", date: "2026-01-16" }); // completed on time

      const alerts = await svc.getIntelligentAlerts(REF);
      const relevant = alerts.filter((a) => a.patientId === "P-OK");
      expect(relevant.some((a) => a.type === "LONG_GAP")).toBe(false);
      expect(relevant.some((a) => a.type === "MISSED_RECURRING")).toBe(false);
    });
  });
});
