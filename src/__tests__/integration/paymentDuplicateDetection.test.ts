import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Doctor-requested feature: "Record Later Payment" -- duplicate protection.
 * A payment screenshot could accidentally be uploaded/posted twice; these
 * tests cover findLikelyDuplicatePayment(), the check the review step runs
 * right before posting. No real patient/payment data used.
 */

const DB_NAME = "SakhiClinicDB";

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
    id, name, gender: "Female", phone: "9000000000",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as any);
}

async function seedConsultation(overrides: {
  id: string; patientId: string; date: string; fee?: number;
  paymentStatus?: string; paymentMode?: string; amountReceived?: number;
  paymentDate?: string; paymentReferenceNumber?: string;
}) {
  await db.consultations.add({
    id: overrides.id,
    patientId: overrides.patientId,
    date: overrides.date,
    clinicId: "Dabholi",
    chiefComplaint: "Test complaint",
    caseText: "",
    outcome: "IMPROVED",
    medicines: [],
    fee: overrides.fee,
    paymentStatus: overrides.paymentStatus,
    paymentMode: overrides.paymentMode,
    amountReceived: overrides.amountReceived,
    paymentDate: overrides.paymentDate,
    paymentReferenceNumber: overrides.paymentReferenceNumber,
  } as any);
}

describe("findLikelyDuplicatePayment", () => {
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

  it("returns null when the patient has no prior recorded payments", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedConsultation({ id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500 });

    const result = await svc.findLikelyDuplicatePayment({ patientId: "p1", amount: 500, date: "2026-03-05" });
    expect(result).toBeNull();
  });

  it("flags an exact transaction-reference match as the strongest signal", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedConsultation({
      id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500,
      amountReceived: 500, paymentDate: "2026-03-02", paymentReferenceNumber: "UPI123XYZ",
    });

    // Different amount/date but the SAME reference number, e.g. the doctor
    // re-uploading the same screenshot with a typo'd amount the second time.
    const result = await svc.findLikelyDuplicatePayment({
      patientId: "p1", amount: 999, date: "2026-04-10", referenceNumber: "upi123xyz",
    });
    expect(result).not.toBeNull();
    expect(result?.consultationId).toBe("c1");
    expect(result?.paymentReferenceNumber).toBe("UPI123XYZ");
  });

  it("flags a same-amount-same-date match when no reference number is available", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedConsultation({
      id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500,
      amountReceived: 500, paymentDate: "2026-03-02",
    });

    const result = await svc.findLikelyDuplicatePayment({ patientId: "p1", amount: 500, date: "2026-03-02" });
    expect(result).not.toBeNull();
    expect(result?.consultationId).toBe("c1");
  });

  it("does not flag a different amount on the same date", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedConsultation({
      id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500,
      amountReceived: 500, paymentDate: "2026-03-02",
    });

    const result = await svc.findLikelyDuplicatePayment({ patientId: "p1", amount: 300, date: "2026-03-02" });
    expect(result).toBeNull();
  });

  it("does not flag the same amount on a different date", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedConsultation({
      id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500,
      amountReceived: 500, paymentDate: "2026-03-02",
    });

    const result = await svc.findLikelyDuplicatePayment({ patientId: "p1", amount: 500, date: "2026-05-01" });
    expect(result).toBeNull();
  });

  it("never matches against a different patient's payments", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedPatient("p2", "Test Patient B");
    await seedConsultation({
      id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500,
      amountReceived: 500, paymentDate: "2026-03-02", paymentReferenceNumber: "REF1",
    });

    const result = await svc.findLikelyDuplicatePayment({
      patientId: "p2", amount: 500, date: "2026-03-02", referenceNumber: "REF1",
    });
    expect(result).toBeNull();
  });

  it("ignores consultations with no money received yet", async () => {
    await seedPatient("p1", "Test Patient A");
    await seedConsultation({ id: "c1", patientId: "p1", date: "2026-03-01T10:00:00.000Z", fee: 500, amountReceived: 0 });

    const result = await svc.findLikelyDuplicatePayment({ patientId: "p1", amount: 500, date: "2026-03-01" });
    expect(result).toBeNull();
  });
});
