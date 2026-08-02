import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * cancelFollowUp (RC1 Follow-up Management) -- the rest of patientService.ts
 * is exercised indirectly through the app's own flow tests; this covers the
 * one genuinely new piece of write logic this module gained.
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
let svc: typeof import("../../services/patientService");

describe("patientService.cancelFollowUp", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/patientService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("marks the patient's current nextFollowUpDate as cancelled", async () => {
    await db.patients.add({
      id: "p1", name: "Asha", gender: "Female", phone: "9876543210",
      nextFollowUpDate: "2026-03-20",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);

    await svc.cancelFollowUp("p1");

    const patient = await db.patients.get("p1");
    expect(patient?.followUpCancelledDate).toBe("2026-03-20");
    expect(patient?.nextFollowUpDate).toBe("2026-03-20"); // left in place -- the cancellation is a marker, not a deletion
  });

  it("is a no-op for a patient with no active follow-up date", async () => {
    await db.patients.add({
      id: "p1", name: "Asha", gender: "Female", phone: "9876543210",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);

    await svc.cancelFollowUp("p1");

    const patient = await db.patients.get("p1");
    expect(patient?.followUpCancelledDate).toBeUndefined();
  });

  it("does not throw for a nonexistent patient", async () => {
    await expect(svc.cancelFollowUp("does-not-exist")).resolves.toBeUndefined();
  });
});
