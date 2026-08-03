import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * RC2 Phase 1 -- v54 to v55 migration (rubrics table).
 *
 * Same discipline as dbMigrationV51.test.ts: build a real v54-only Dexie
 * database (schema copied verbatim from db.ts's v54 block), seed it,
 * close it, then open the app's real db.ts module against the same
 * database name so Dexie runs its genuine v54->v55 upgrade path.
 */

const DB_NAME = "SakhiClinicDB";

async function seedV54Database() {
  class V54Only extends Dexie {
    constructor() {
      super(DB_NAME);
      this.version(54).stores({
        patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
        consultations: "id, patientId, appointmentId, date, outcome, clinicId, paymentStatus, learnedAt, deletedAt, createdAt, updatedAt",
        learning: "++id, [remedy+symptomKey], remedy, symptomKey",
        caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
        appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
        drafts: "id, patientId, savedAt",
        syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
        operationalEvents: "id, timestamp, level, type",
        appMeta: "id",
        reminderQueue: "id, patientId, type, status, dueAt, channel",
        reminderHistory: "id, reminderId, patientId, attemptedAt, action",
        backupJobs: "id, kind, providerId, status, createdAt, nextRetryAt",
      });
    }
  }

  const legacyDb = new V54Only();
  await legacyDb.open();
  await (legacyDb as any).patients.bulkAdd([
    { id: "P-MIG-1", name: "Pre-Rubric Patient", phone: "9000000001", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  await (legacyDb as any).consultations.bulkAdd([
    {
      id: "C-MIG-1", patientId: "P-MIG-1", date: "2026-01-05T10:00:00.000Z", clinicId: "Dabholi",
      chiefComplaint: "Headache", caseText: "Throbbing headache, worse in sun", medicines: [],
      outcome: "NoChange", createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z",
    },
  ]);
  expect(legacyDb.verno).toBe(54);
  legacyDb.close();
}

describe("RC2 Phase 1 — v54 to v55 migration (rubrics)", () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = fakeIndexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  it("upgrades a populated v54 database to v55 with zero data loss and a working rubrics table", async () => {
    await seedV54Database();

    const { db } = await import("../../services/db");
    await db.open();

    expect(db.verno).toBe(55);

    // Pre-existing data is completely untouched.
    const patients = await db.patients.toArray();
    expect(patients).toHaveLength(1);
    expect(patients[0].name).toBe("Pre-Rubric Patient");

    const consultations = await db.consultations.toArray();
    expect(consultations).toHaveLength(1);
    expect(consultations[0].chiefComplaint).toBe("Headache");
    // rubricsGeneratedAt is a plain optional field, absent on pre-existing
    // rows -- not undefined-vs-missing distinguishable via Dexie, but the
    // read path (rubricApprovalService) must treat this as "not yet
    // processed," same as learnedAt already does.
    expect((consultations[0] as any).rubricsGeneratedAt).toBeUndefined();

    // New table exists, starts empty, and is genuinely writable.
    expect(await db.rubrics.toArray()).toEqual([]);

    await db.rubrics.put({
      id: "RB1", consultationId: "C-MIG-1", patientId: "P-MIG-1",
      category: "modalities", text: "Worse from sun exposure", source: "ai",
      status: "pending", confidence: 0.7, matchedSentence: "worse in sun",
      createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z",
    });
    expect(await db.rubrics.count()).toBe(1);

    db.close();
  });

  it("rollback: a v55 database is safe to read from reverted v54 code (rubrics table simply invisible)", async () => {
    await seedV54Database();
    const { db } = await import("../../services/db");
    await db.open();
    await db.rubrics.put({
      id: "RB1", consultationId: "C-MIG-1", patientId: "P-MIG-1",
      category: "mind", text: "Anxiety about health", source: "manual",
      status: "approved", createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z",
    });
    db.close();

    class V54Only extends Dexie {
      constructor() {
        super(DB_NAME);
        this.version(54).stores({
          patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
          consultations: "id, patientId, appointmentId, date, outcome, clinicId, paymentStatus, learnedAt, deletedAt, createdAt, updatedAt",
          learning: "++id, [remedy+symptomKey], remedy, symptomKey",
          caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
          appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
          drafts: "id, patientId, savedAt",
          syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
          operationalEvents: "id, timestamp, level, type",
          appMeta: "id",
          reminderQueue: "id, patientId, type, status, dueAt, channel",
          reminderHistory: "id, reminderId, patientId, attemptedAt, action",
          backupJobs: "id, kind, providerId, status, createdAt, nextRetryAt",
        });
      }
    }

    const reverted = new V54Only();
    await reverted.open();
    expect(reverted.verno).toBe(54);

    const patient = await (reverted as any).patients.get("P-MIG-1");
    expect(patient?.name).toBe("Pre-Rubric Patient");

    expect(() => (reverted as any).table("rubrics")).toThrow(/does not exist/i);

    reverted.close();
  });
});
