import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Phase 2 — v50 to v51 migration (reminderQueue + reminderHistory).
 *
 * Same discipline as dbMigrationV50.test.ts: build a real v50-only Dexie
 * database (schema copied verbatim from db.ts's v50 block), seed it,
 * close it, then open the app's real db.ts module against the same
 * database name so Dexie runs its genuine v50->v51 upgrade path.
 */

const DB_NAME = "SakhiClinicDB";

async function seedV50Database() {
  class V50Only extends Dexie {
    constructor() {
      super(DB_NAME);
      this.version(50).stores({
        patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
        consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
        learning: "++id, [remedy+symptomKey], remedy, symptomKey",
        caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
        appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
        drafts: "id, patientId, savedAt",
        syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
        operationalEvents: "id, timestamp, level, type",
        appMeta: "id",
      });
    }
  }

  const legacyDb = new V50Only();
  await legacyDb.open();
  await (legacyDb as any).patients.bulkAdd([
    { id: "P-MIG-1", name: "Pre-Reminder Patient", phone: "9000000001", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  await (legacyDb as any).appMeta.put({
    id: "app-meta", installId: "install-1", firstRunOrigin: "https://sakhi-clinic.vercel.app", firstRunAt: "2026-01-01T00:00:00.000Z",
  });
  expect(legacyDb.verno).toBe(50);
  legacyDb.close();
}

describe("Phase 2 — v50 to v51 migration (reminderQueue/reminderHistory)", () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = fakeIndexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  it("upgrades a populated v50 database to v51 with zero data loss and working reminder tables", async () => {
    await seedV50Database();

    const { db } = await import("../../services/db");
    await db.open();

    expect(db.verno).toBe(51);

    // Pre-existing data is completely untouched.
    const patients = await db.patients.toArray();
    expect(patients).toHaveLength(1);
    expect(patients[0].name).toBe("Pre-Reminder Patient");

    const appMetaRows = await db.appMeta.toArray();
    expect(appMetaRows).toHaveLength(1);
    expect(appMetaRows[0].installId).toBe("install-1");

    // New tables exist, start empty, and are genuinely writable.
    expect(await db.reminderQueue.toArray()).toEqual([]);
    expect(await db.reminderHistory.toArray()).toEqual([]);

    await db.reminderQueue.put({
      id: "R1", patientId: "P-MIG-1", patientName: "Pre-Reminder Patient", type: "follow_up",
      channel: "whatsapp", message: "test", dueAt: "2026-03-15T00:00:00.000Z", status: "pending",
      retryCount: 0, createdAt: "2026-03-15T00:00:00.000Z", updatedAt: "2026-03-15T00:00:00.000Z",
    });
    expect(await db.reminderQueue.count()).toBe(1);

    db.close();
  });

  it("rollback: a v51 database is safe to read from reverted v50 code (reminder tables simply invisible)", async () => {
    await seedV50Database();
    const { db } = await import("../../services/db");
    await db.open();
    await db.reminderQueue.put({
      id: "R1", patientId: "P-MIG-1", patientName: "Pre-Reminder Patient", type: "follow_up",
      channel: "whatsapp", message: "test", dueAt: "2026-03-15T00:00:00.000Z", status: "pending",
      retryCount: 0, createdAt: "2026-03-15T00:00:00.000Z", updatedAt: "2026-03-15T00:00:00.000Z",
    });
    db.close();

    class V50Only extends Dexie {
      constructor() {
        super(DB_NAME);
        this.version(50).stores({
          patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
          consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
          learning: "++id, [remedy+symptomKey], remedy, symptomKey",
          caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
          appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
          drafts: "id, patientId, savedAt",
          syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
          operationalEvents: "id, timestamp, level, type",
          appMeta: "id",
        });
      }
    }

    const reverted = new V50Only();
    await reverted.open();
    expect(reverted.verno).toBe(50);

    const patient = await (reverted as any).patients.get("P-MIG-1");
    expect(patient?.name).toBe("Pre-Reminder Patient");

    expect(() => (reverted as any).table("reminderQueue")).toThrow(/does not exist/i);

    reverted.close();
  });
});
