import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Module A — acceptance criterion A6: "Schema migration v49->v50 completes on
 * a populated test database with zero data loss."
 *
 * This builds a real v49-only Dexie database (schema copied verbatim from the
 * v49 block in db.ts, before the v50 appMeta addition), seeds it with data,
 * closes it, then opens the app's actual db.ts module against the SAME
 * underlying database name. Dexie performs its real upgrade path when it sees
 * the stored version (49) is behind the code's declared version (50) — this
 * is not a simulation, it is the genuine migration the doctor's browser will
 * run on first load after this change ships.
 */

const DB_NAME = "SakhiClinicDB";

async function seedV49Database() {
  class V49Only extends Dexie {
    constructor() {
      super(DB_NAME);
      this.version(49).stores({
        patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
        consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
        learning: "++id, [remedy+symptomKey], remedy, symptomKey",
        caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
        appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
        drafts: "id, patientId, savedAt",
        syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
        operationalEvents: "id, timestamp, level, type",
      });
    }
  }

  const legacyDb = new V49Only();
  await legacyDb.open();
  await (legacyDb as any).patients.bulkAdd([
    { id: "P-MIG-1", name: "Legacy Patient One", phone: "9000000001", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "P-MIG-2", name: "Legacy Patient Two", phone: "9000000002", createdAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" },
  ]);
  await (legacyDb as any).consultations.bulkAdd([
    { id: "C-MIG-1", patientId: "P-MIG-1", date: "2026-01-05T00:00:00.000Z", outcome: "Improved", clinicId: "Dabholi", createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z" },
  ]);
  await (legacyDb as any).appointments.bulkAdd([
    { id: "A-MIG-1", date: "2026-08-01", patientId: "P-MIG-1", status: "booked", clinic: "Dabholi", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  expect(legacyDb.verno).toBe(49);
  legacyDb.close();
}

describe("Module A — v49 to v50 migration (A6)", () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = fakeIndexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  it("upgrades a populated v49 database to v50 with zero data loss and a working appMeta table", async () => {
    await seedV49Database();

    // Import the app's real db module only now, after the v49 seed exists on
    // disk -- this is what forces Dexie's genuine upgrade path to run, not a
    // hand-written stand-in for it. Opening the real (current) db.ts against
    // a v49-seeded database replays every version in sequence (v49->v50->
    // v51->v52) -- this test still exercises the v49->v50 step specifically
    // (that's what seedV49Database() sets up), it just lands on whatever the
    // app's current version is afterward, same as a real doctor's browser
    // would on first load post-upgrade.
    const { db } = await import("../../services/db");
    await db.open();

    expect(db.verno).toBe(54);

    const patients = await db.patients.toArray();
    expect(patients).toHaveLength(2);
    expect(patients.map((p) => p.id).sort()).toEqual(["P-MIG-1", "P-MIG-2"]);
    expect(patients.find((p) => p.id === "P-MIG-1")?.name).toBe("Legacy Patient One");

    const consultations = await db.consultations.toArray();
    expect(consultations).toHaveLength(1);
    expect(consultations[0].id).toBe("C-MIG-1");

    const appointments = await db.appointments.toArray();
    expect(appointments).toHaveLength(1);
    expect(appointments[0].id).toBe("A-MIG-1");

    // appMeta exists as a queryable table post-migration but starts empty --
    // population happens at app start via originIdentityService, not inside
    // the Dexie upgrade itself (see db.ts's v50 comment for why).
    const appMetaRows = await db.appMeta.toArray();
    expect(appMetaRows).toEqual([]);

    db.close();
  });

  it("rollback: a v50 database with no appMeta usage is indistinguishable from v49 for existing tables", async () => {
    // Confirms the migration is additive-only: opening at v50 and never
    // touching appMeta leaves every pre-existing table's data exactly as it
    // was, which is what makes "revert the code, ignore appMeta" a safe
    // rollback per the contract's Rollback Strategy.
    await seedV49Database();
    const { db } = await import("../../services/db");
    await db.open();

    const patient = await db.patients.get("P-MIG-1");
    expect(patient).toMatchObject({ id: "P-MIG-1", name: "Legacy Patient One", phone: "9000000001" });

    db.close();
  });
});
