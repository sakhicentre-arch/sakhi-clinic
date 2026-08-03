import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Payment Tracker (Module 4) -- operational payment records on
 * Consultation, not accounting. All assertions pin a fixed `REF` date
 * rather than `new Date()`, matching followUpIntelligenceService's own
 * test convention, since getPaymentSummary buckets by "today"/"this
 * month" relative to a reference date.
 */

const DB_NAME = "SakhiClinicDB";
const REF = new Date(2026, 2, 15, 12, 0, 0); // local March 15, 2026 -- avoids the UTC-parse pitfall dateOnly.ts itself warns about

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

let db: typeof import("../../services/db").db;
let svc: typeof import("../../services/paymentService");

async function seedPatient(id: string, name: string) {
  await db.patients.add({
    id, name, gender: "Female", phone: "9876543210",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as any);
}

/** consultation.date is always a full ISO string in production (see
 * paymentService.ts's own comment) -- these helpers build one from a
 * local Y/M/D so "isSameLocalDay(c.date, REF)" behaves the same way it
 * would for a real doctor in IST. */
function isoOnLocalDay(year: number, month: number, day: number, hour = 10): string {
  return new Date(year, month, day, hour).toISOString();
}

async function seedConsultation(overrides: {
  id: string; patientId: string; date: string; fee?: number;
  paymentStatus?: string; paymentMode?: string; amountReceived?: number; paymentDate?: string; clinicId?: string;
}) {
  await db.consultations.add({
    id: overrides.id,
    patientId: overrides.patientId,
    date: overrides.date,
    clinicId: overrides.clinicId || "Dabholi",
    chiefComplaint: "Test complaint",
    caseText: "",
    outcome: "IMPROVED",
    medicines: [],
    fee: overrides.fee,
    paymentStatus: overrides.paymentStatus,
    paymentMode: overrides.paymentMode,
    amountReceived: overrides.amountReceived,
    paymentDate: overrides.paymentDate,
  } as any);
}

describe("paymentService", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/paymentService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  describe("getConsultationOutstanding / getConsultationCollected", () => {
    it("paid: 0 outstanding, fee collected even without explicit amountReceived (pre-V54 rows)", () => {
      const c = { fee: 500, paymentStatus: "paid" } as any;
      expect(svc.getConsultationOutstanding(c)).toBe(0);
      expect(svc.getConsultationCollected(c)).toBe(500);
    });

    it("waived: always 0 outstanding and 0 collected, regardless of fee", () => {
      const c = { fee: 500, paymentStatus: "waived" } as any;
      expect(svc.getConsultationOutstanding(c)).toBe(0);
      expect(svc.getConsultationCollected(c)).toBe(0);
    });

    it("partial: outstanding is fee minus amountReceived, never negative", () => {
      const c = { fee: 500, paymentStatus: "partial", amountReceived: 200 } as any;
      expect(svc.getConsultationOutstanding(c)).toBe(300);
      expect(svc.getConsultationCollected(c)).toBe(200);

      const overpaid = { fee: 500, paymentStatus: "partial", amountReceived: 600 } as any;
      expect(svc.getConsultationOutstanding(overpaid)).toBe(0);
    });

    it("pending (or unset): full fee outstanding, nothing collected", () => {
      expect(svc.getConsultationOutstanding({ fee: 500, paymentStatus: "pending" } as any)).toBe(500);
      expect(svc.getConsultationOutstanding({ fee: 500 } as any)).toBe(500); // unset treated as pending
      expect(svc.getConsultationCollected({ fee: 500 } as any)).toBe(0);
    });
  });

  describe("recordPayment", () => {
    it("updates payment fields on an existing consultation via the real save pipeline", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), fee: 500, paymentStatus: "pending" });

      const updated = await svc.recordPayment("c1", {
        status: "paid",
        amountReceived: 500,
        mode: "upi",
        referenceNumber: "UPI123",
        notes: "Paid via WhatsApp screenshot",
      });

      expect(updated.paymentStatus).toBe("paid");
      expect(updated.amountReceived).toBe(500);
      expect(updated.paymentMode).toBe("upi");
      expect(updated.paymentReferenceNumber).toBe("UPI123");
      expect(updated.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // defaulted to today, bare date format

      const fromDb = await db.consultations.get("c1");
      expect(fromDb?.paymentStatus).toBe("paid");
      // saveConsultation's own bookkeeping still applied -- not a parallel write path.
      expect(fromDb?.version).toBeGreaterThanOrEqual(1);
    });

    it("throws cleanly for a nonexistent consultation, without touching the database", async () => {
      await expect(svc.recordPayment("does-not-exist", { status: "paid" })).rejects.toThrow(/not found/i);
    });

    it("preserves an existing screenshot when the input omits one, but replaces it when given", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), fee: 500 });

      await svc.recordPayment("c1", { status: "partial", amountReceived: 100, screenshotDataUrl: "data:image/jpeg;base64,AAA" });
      const afterFirst = await svc.recordPayment("c1", { status: "partial", amountReceived: 200 }); // no screenshot this time
      expect(afterFirst.paymentScreenshotDataUrl).toBe("data:image/jpeg;base64,AAA"); // untouched

      const afterReplace = await svc.recordPayment("c1", { status: "paid", amountReceived: 500, screenshotDataUrl: "data:image/jpeg;base64,BBB" });
      expect(afterReplace.paymentScreenshotDataUrl).toBe("data:image/jpeg;base64,BBB");
    });
  });

  describe("getPaymentSummary", () => {
    it("computes billedToday/collectedToday/pendingCollectionToday from consultation.date vs. paymentDate", async () => {
      await seedPatient("p1", "Asha");
      // Consultation happened today, fee 500, nothing paid yet.
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), fee: 500, paymentStatus: "pending" });
      // Consultation happened today, fee 300, fully paid TODAY.
      await seedConsultation({ id: "c2", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), fee: 300, paymentStatus: "paid", amountReceived: 300, paymentDate: "2026-03-15" });
      // Consultation from days ago, but payment for it arrived today (the doctor-receives-payment-later case).
      await seedConsultation({ id: "c3", patientId: "p1", date: isoOnLocalDay(2026, 2, 10), fee: 400, paymentStatus: "paid", amountReceived: 400, paymentDate: "2026-03-15" });
      // Unrelated: a different day entirely.
      await seedConsultation({ id: "c4", patientId: "p1", date: isoOnLocalDay(2026, 2, 1), fee: 200, paymentStatus: "paid", amountReceived: 200, paymentDate: "2026-03-01" });

      const summary = await svc.getPaymentSummary(REF);

      expect(summary.billedToday).toBe(800); // c1 + c2 (both dated today)
      expect(summary.collectedToday).toBe(700); // c2 + c3 (both PAID today, regardless of visit date)
      expect(summary.pendingCollectionToday).toBe(100); // 800 - 700
      expect(summary.collectedThisMonth).toBe(900); // c2 + c3 (paid today) + c4 (paymentDate Mar 1, same month)
    });

    it("collectedThisMonth includes every payment recorded in the reference month, regardless of visit date", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 1, 20), fee: 200, paymentStatus: "paid", amountReceived: 200, paymentDate: "2026-03-02" });
      const summary = await svc.getPaymentSummary(REF);
      expect(summary.collectedThisMonth).toBe(200);
    });

    it("pendingPaymentsCount and outstandingAmount reflect the all-time backlog, not scoped to today", async () => {
      await seedPatient("p1", "Asha");
      await seedPatient("p2", "Rahul");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500, paymentStatus: "pending" });
      await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 1, 10), fee: 300, paymentStatus: "partial", amountReceived: 100 });
      await seedConsultation({ id: "c3", patientId: "p2", date: isoOnLocalDay(2026, 2, 15), fee: 200, paymentStatus: "paid", amountReceived: 200 });

      const summary = await svc.getPaymentSummary(REF);
      expect(summary.pendingPaymentsCount).toBe(2); // c1 (pending) + c2 (partial) -- c3 is paid, excluded
      expect(summary.outstandingAmount).toBe(700); // 500 + (300-100)
    });
  });

  describe("getOutstandingPatients", () => {
    it("groups outstanding amounts per patient, sorted highest first", async () => {
      await seedPatient("p1", "Asha");
      await seedPatient("p2", "Rahul");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500, paymentStatus: "pending" });
      await seedConsultation({ id: "c2", patientId: "p1", date: isoOnLocalDay(2026, 1, 5), fee: 100, paymentStatus: "pending" });
      await seedConsultation({ id: "c3", patientId: "p2", date: isoOnLocalDay(2026, 0, 5), fee: 1000, paymentStatus: "partial", amountReceived: 100 });

      const outstanding = await svc.getOutstandingPatients();
      expect(outstanding).toHaveLength(2);
      expect(outstanding[0]).toMatchObject({ patientId: "p2", name: "Rahul", amount: 900 });
      expect(outstanding[1]).toMatchObject({ patientId: "p1", name: "Asha", amount: 600, consultationCount: 2 });
    });

    it("excludes patients with nothing outstanding", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500, paymentStatus: "paid", amountReceived: 500 });
      const outstanding = await svc.getOutstandingPatients();
      expect(outstanding).toHaveLength(0);
    });

    it("scopes to one clinic when a clinicId is given -- the Payment Dashboard's branch filter", async () => {
      await seedPatient("p1", "Asha");
      await seedPatient("p2", "Rahul");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500, paymentStatus: "pending", clinicId: "Dabholi" });
      await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 0, 5), fee: 300, paymentStatus: "pending", clinicId: "City Light" });

      const dabholiOnly = await svc.getOutstandingPatients("Dabholi");
      expect(dabholiOnly.map((o) => o.patientId)).toEqual(["p1"]);

      const allClinics = await svc.getOutstandingPatients();
      expect(allClinics.map((o) => o.patientId).sort()).toEqual(["p1", "p2"]);
    });
  });

  describe("getPaymentDashboardDrilldowns", () => {
    it("splits per-patient billed/collected/pending entries for the Payment Dashboard's cards", async () => {
      await seedPatient("p1", "Asha");
      await seedPatient("p2", "Rahul");
      // Billed today, nothing paid yet -- shows up in billedToday and pendingCollectionToday.
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), fee: 500, paymentStatus: "pending" });
      // Billed today, paid in full today -- billedToday + collectedToday + collectedThisMonth, NOT pendingCollectionToday.
      await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 2, 15), fee: 300, paymentStatus: "paid", amountReceived: 300, paymentDate: "2026-03-15" });
      // Old visit, payment received today -- collectedToday/collectedThisMonth only, NOT billedToday (visit wasn't today).
      await seedConsultation({ id: "c3", patientId: "p1", date: isoOnLocalDay(2026, 1, 1), fee: 400, paymentStatus: "paid", amountReceived: 400, paymentDate: "2026-03-15" });

      const d = await svc.getPaymentDashboardDrilldowns(REF);

      expect(d.billedToday.map((r) => r.patientId).sort()).toEqual(["p1", "p2"]);
      expect(d.pendingCollectionToday.map((r) => r.patientId)).toEqual(["p1"]);
      expect(d.collectedToday.map((r) => r.patientId).sort()).toEqual(["p1", "p2"]);
      expect(d.collectedThisMonth.map((r) => r.patientId).sort()).toEqual(["p1", "p2"]);
      expect(d.billedToday.find((r) => r.patientId === "p1")?.detail).toMatch(/500/);
    });

    it("scopes to one clinic when a clinicId is given", async () => {
      await seedPatient("p1", "Asha");
      await seedPatient("p2", "Rahul");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 2, 15), fee: 500, clinicId: "Dabholi" });
      await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 2, 15), fee: 300, clinicId: "City Light" });

      const d = await svc.getPaymentDashboardDrilldowns(REF, "Dabholi");
      expect(d.billedToday.map((r) => r.patientId)).toEqual(["p1"]);
    });
  });

  describe("getConsultationsByPaymentStatus", () => {
    it("filters by one or more statuses, treating unset as pending", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500 }); // unset -> pending
      await seedConsultation({ id: "c2", patientId: "p1", date: isoOnLocalDay(2026, 0, 6), fee: 200, paymentStatus: "partial", amountReceived: 50 });
      await seedConsultation({ id: "c3", patientId: "p1", date: isoOnLocalDay(2026, 0, 7), fee: 300, paymentStatus: "paid", amountReceived: 300 });

      const pendingAndPartial = await svc.getConsultationsByPaymentStatus(["pending", "partial"]);
      expect(pendingAndPartial.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    });
  });

  describe("getPatientPaymentSummary", () => {
    it("aggregates one patient's full payment picture, most-recent consultation first", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500, paymentStatus: "paid", amountReceived: 500 });
      await seedConsultation({ id: "c2", patientId: "p1", date: isoOnLocalDay(2026, 1, 5), fee: 300, paymentStatus: "partial", amountReceived: 100 });

      const ledger = await svc.getPatientPaymentSummary("p1");
      expect(ledger.totalFees).toBe(800);
      expect(ledger.totalPaid).toBe(600);
      expect(ledger.outstanding).toBe(200);
      expect(ledger.consultations.map((c) => c.id)).toEqual(["c2", "c1"]); // Feb before Jan -> c2 first
    });

    it("returns an empty-but-valid summary for a patient with no consultations", async () => {
      await seedPatient("p1", "Asha");
      const ledger = await svc.getPatientPaymentSummary("p1");
      expect(ledger).toEqual({ totalFees: 0, totalPaid: 0, outstanding: 0, consultations: [] });
    });
  });

  describe("getRecentPayments", () => {
    it("returns only consultations with a real amountReceived, most recent payment first", async () => {
      await seedPatient("p1", "Asha");
      await seedPatient("p2", "Bina");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 1), fee: 500, paymentStatus: "paid", amountReceived: 500, paymentDate: "2026-01-01" });
      await seedConsultation({ id: "c2", patientId: "p2", date: isoOnLocalDay(2026, 0, 2), fee: 300, paymentStatus: "partial", amountReceived: 100, paymentDate: "2026-01-03" });
      // No payment recorded at all -- must be excluded, not shown as a ₹0 entry.
      await seedConsultation({ id: "c3", patientId: "p1", date: isoOnLocalDay(2026, 0, 4), fee: 200 });

      const recent = await svc.getRecentPayments(10);
      expect(recent.map((p) => p.consultationId)).toEqual(["c2", "c1"]); // Jan 3 before Jan 1
      expect(recent[0]).toMatchObject({ patientId: "p2", patientName: "Bina", amount: 100 });
    });

    it("respects the limit and resolves patient names, not just IDs", async () => {
      await seedPatient("p1", "Asha");
      for (let i = 0; i < 5; i++) {
        await seedConsultation({
          id: `c${i}`, patientId: "p1", date: isoOnLocalDay(2026, 0, i + 1),
          fee: 100, paymentStatus: "paid", amountReceived: 100, paymentDate: `2026-01-0${i + 1}`,
        });
      }

      const recent = await svc.getRecentPayments(3);
      expect(recent).toHaveLength(3);
      expect(recent.every((p) => p.patientName === "Asha")).toBe(true);
    });

    it("returns an empty array when nothing has ever been paid", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 1), fee: 500 });
      expect(await svc.getRecentPayments()).toEqual([]);
    });
  });

  describe("getPaymentHistoryInRange", () => {
    it("includes only consultations with a fee whose date falls within the inclusive range", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "before", patientId: "p1", date: isoOnLocalDay(2026, 0, 4), fee: 500 });
      await seedConsultation({ id: "start-boundary", patientId: "p1", date: isoOnLocalDay(2026, 0, 5), fee: 500 });
      await seedConsultation({ id: "middle", patientId: "p1", date: isoOnLocalDay(2026, 0, 7), fee: 500 });
      await seedConsultation({ id: "end-boundary", patientId: "p1", date: isoOnLocalDay(2026, 0, 10), fee: 500 });
      await seedConsultation({ id: "after", patientId: "p1", date: isoOnLocalDay(2026, 0, 11), fee: 500 });
      await seedConsultation({ id: "no-fee", patientId: "p1", date: isoOnLocalDay(2026, 0, 7), fee: 0 });

      const history = await svc.getPaymentHistoryInRange("2026-01-05", "2026-01-10");
      expect(history.map((h) => h.consultationId).sort()).toEqual(["end-boundary", "middle", "start-boundary"]);
    });

    it("resolves patient names and includes the payment reference number", async () => {
      await seedPatient("p1", "Chandni");
      await seedConsultation({
        id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 6), fee: 500,
        paymentStatus: "paid", amountReceived: 500,
      });
      await db.consultations.update("c1", { paymentReferenceNumber: "UPI-123" } as any);

      const [entry] = await svc.getPaymentHistoryInRange("2026-01-01", "2026-01-31");
      expect(entry.patientName).toBe("Chandni");
      expect(entry.paymentReferenceNumber).toBe("UPI-123");
      expect(entry.amountReceived).toBe(500);
    });

    it("respects clinicId scoping the same way getPaymentSummary does", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 6), fee: 500, clinicId: "Dabholi" });
      await seedConsultation({ id: "c2", patientId: "p1", date: isoOnLocalDay(2026, 0, 6), fee: 500, clinicId: "City Light" });

      const dabholiOnly = await svc.getPaymentHistoryInRange("2026-01-01", "2026-01-31", "Dabholi");
      expect(dabholiOnly.map((h) => h.consultationId)).toEqual(["c1"]);
    });

    it("returns an empty array for a range with no matching consultations", async () => {
      await seedPatient("p1", "Asha");
      await seedConsultation({ id: "c1", patientId: "p1", date: isoOnLocalDay(2026, 0, 6), fee: 500 });
      expect(await svc.getPaymentHistoryInRange("2026-02-01", "2026-02-28")).toEqual([]);
    });
  });

  describe("buildPaymentReceiptMessage (WhatsApp Productivity)", () => {
    it("includes fee, amount received, mode, reference, and no balance-due line when fully paid", () => {
      const message = svc.buildPaymentReceiptMessage("Asha", {
        fee: 500, amountReceived: 500, paymentMode: "upi", paymentReferenceNumber: "UPI-999",
        paymentDate: "2026-01-05", date: "2026-01-05",
      } as any);
      expect(message).toContain("Asha");
      expect(message).toContain("₹500");
      expect(message).toContain("UPI");
      expect(message).toContain("UPI-999");
      expect(message).not.toContain("Balance due");
    });

    it("includes a balance-due line for a partial payment", () => {
      const message = svc.buildPaymentReceiptMessage("Kavya", {
        fee: 1000, amountReceived: 400, paymentMode: "cash", date: "2026-01-05",
      } as any);
      expect(message).toContain("Balance due: ₹600");
    });

    it("omits reference/mode lines when not recorded", () => {
      const message = svc.buildPaymentReceiptMessage("Meera", { fee: 300, amountReceived: 300, date: "2026-01-05" } as any);
      expect(message).not.toContain("Reference:");
      expect(message).toContain("Received: ₹300");
    });
  });
});
