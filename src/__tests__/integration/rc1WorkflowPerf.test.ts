import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * RC1 production certification — large-dataset performance measurement for
 * the workflow functions this pass added or extended (Doctor Action
 * Dashboard, Payment Dashboard, Follow-up buckets). Same honest-measurement
 * convention as perfMeasurement.test.ts: real wall-clock time against
 * fake-indexeddb, proving the SHAPE of the cost (these are single full-table
 * scans, same O(n) pattern already used by every pre-RC1 dashboard query --
 * see this file's own header comment) rather than predicting real-device ms.
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

// A busy single-doctor homeopathic clinic over several years: chronic cases
// mean many follow-up visits per patient, so consultations well outnumber patients.
const PATIENT_COUNT = 2000;
const CONSULTATIONS_PER_PATIENT = 3;

describe("RC1 workflow functions — large dataset performance (this environment only)", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const patients = Array.from({ length: PATIENT_COUNT }, (_, i) => ({
      id: `P-${i}`,
      name: `Patient ${i}`,
      gender: i % 2 === 0 ? "Female" : "Male",
      phone: `9${String(i).padStart(9, "0")}`,
      // Every 5th patient has an active follow-up due today -- realistic
      // "some fraction of the panel needs attention right now" shape.
      nextFollowUpDate: i % 5 === 0 ? today : undefined,
      createdAt: i % 50 === 0 ? now.toISOString() : "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    }));
    await db.patients.bulkAdd(patients as any);

    const consultations: any[] = [];
    let cId = 0;
    for (let p = 0; p < PATIENT_COUNT; p++) {
      for (let c = 0; c < CONSULTATIONS_PER_PATIENT; c++) {
        consultations.push({
          id: `C-${cId++}`,
          patientId: `P-${p}`,
          date: c === CONSULTATIONS_PER_PATIENT - 1 ? now.toISOString() : "2025-06-01T00:00:00.000Z",
          clinicId: "Dabholi",
          chiefComplaint: "Test complaint",
          caseText: "",
          outcome: "IMPROVED",
          medicines: [],
          fee: 500,
          // A realistic outstanding-payment backlog: every 4th consultation unpaid.
          paymentStatus: p % 4 === 0 ? "pending" : "paid",
          amountReceived: p % 4 === 0 ? 0 : 500,
        });
      }
    }
    await db.consultations.bulkAdd(consultations);
  }, 30000);

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it(`MEASURED: getDashboardActionData against ${PATIENT_COUNT} patients / ${PATIENT_COUNT * CONSULTATIONS_PER_PATIENT} consultations`, async () => {
    const { getDashboardActionData } = await import("../../services/dashboardActionService");

    const t0 = performance.now();
    const data = await getDashboardActionData();
    const ms = performance.now() - t0;

    console.log(`[PERF MEASURED] getDashboardActionData: ${ms.toFixed(1)}ms (this environment, fake-indexeddb, ${PATIENT_COUNT} patients)`);

    expect(data.todayFollowUps.length).toBeGreaterThan(0);
    expect(data.pendingPayments.length).toBeGreaterThan(0);
    // The number that actually matters for a doctor waiting on the landing
    // page to render: generous ceiling, not a tight budget.
    expect(ms).toBeLessThan(5000);
  }, 20000);

  it(`MEASURED: getPaymentSummary + getOutstandingPatients against ${PATIENT_COUNT} patients`, async () => {
    const { getPaymentSummary, getOutstandingPatients } = await import("../../services/paymentService");

    const t0 = performance.now();
    const [summary, outstanding] = await Promise.all([getPaymentSummary(), getOutstandingPatients()]);
    const ms = performance.now() - t0;

    console.log(`[PERF MEASURED] getPaymentSummary + getOutstandingPatients: ${ms.toFixed(1)}ms (this environment, fake-indexeddb, ${PATIENT_COUNT} patients)`);

    expect(summary.pendingPaymentsCount).toBeGreaterThan(0);
    expect(outstanding.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(5000);
  }, 20000);

  it(`MEASURED: getFollowUpBuckets against ${PATIENT_COUNT} patients`, async () => {
    const { getFollowUpBuckets } = await import("../../services/followUpIntelligenceService");

    const t0 = performance.now();
    const buckets = await getFollowUpBuckets();
    const ms = performance.now() - t0;

    console.log(`[PERF MEASURED] getFollowUpBuckets: ${ms.toFixed(1)}ms (this environment, fake-indexeddb, ${PATIENT_COUNT} patients)`);

    expect(buckets.today.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(5000);
  }, 20000);

  it("MEASURED: cost does not blow up disproportionately between 500 and 2000 patients (shape check, not an absolute budget)", async () => {
    // Re-seed a smaller dataset in the same run to compare scaling shape.
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();

    const SMALL = 500;
    const now = new Date();
    const smallPatients = Array.from({ length: SMALL }, (_, i) => ({
      id: `SP-${i}`, name: `Small Patient ${i}`, gender: "Female", phone: `8${String(i).padStart(9, "0")}`,
      nextFollowUpDate: i % 5 === 0 ? now.toISOString().slice(0, 10) : undefined,
      createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    }));
    await db.patients.bulkAdd(smallPatients as any);
    const smallConsultations = Array.from({ length: SMALL * CONSULTATIONS_PER_PATIENT }, (_, i) => ({
      id: `SC-${i}`, patientId: `SP-${i % SMALL}`, date: "2025-06-01T00:00:00.000Z",
      clinicId: "Dabholi", chiefComplaint: "x", caseText: "", outcome: "IMPROVED", medicines: [],
      fee: 500, paymentStatus: "pending", amountReceived: 0,
    }));
    await db.consultations.bulkAdd(smallConsultations);

    const { getDashboardActionData } = await import("../../services/dashboardActionService");
    const t0 = performance.now();
    await getDashboardActionData();
    const smallMs = performance.now() - t0;

    await resetDatabase();
    const dbModule2 = await import("../../services/db");
    db = dbModule2.db;
    await db.open();
    const LARGE = 2000;
    const largePatients = Array.from({ length: LARGE }, (_, i) => ({
      id: `LP-${i}`, name: `Large Patient ${i}`, gender: "Female", phone: `7${String(i).padStart(9, "0")}`,
      nextFollowUpDate: i % 5 === 0 ? now.toISOString().slice(0, 10) : undefined,
      createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    }));
    await db.patients.bulkAdd(largePatients as any);
    const largeConsultations = Array.from({ length: LARGE * CONSULTATIONS_PER_PATIENT }, (_, i) => ({
      id: `LC-${i}`, patientId: `LP-${i % LARGE}`, date: "2025-06-01T00:00:00.000Z",
      clinicId: "Dabholi", chiefComplaint: "x", caseText: "", outcome: "IMPROVED", medicines: [],
      fee: 500, paymentStatus: "pending", amountReceived: 0,
    }));
    await db.consultations.bulkAdd(largeConsultations);

    const t1 = performance.now();
    await getDashboardActionData();
    const largeMs = performance.now() - t1;

    const ratio = largeMs / Math.max(smallMs, 1);
    console.log(`[PERF MEASURED] getDashboardActionData: ${SMALL} patients=${smallMs.toFixed(1)}ms, ${LARGE} patients (4x)=${largeMs.toFixed(1)}ms, ratio=${ratio.toFixed(1)}x`);

    // A single full-table scan should scale roughly linearly (~4x data ->
    // roughly 4x time, generously bounded) -- catches an accidental N+1 or
    // nested-loop regression without hard-coding a fragile ms number.
    expect(ratio).toBeLessThan(12);
  }, 30000);
});
