import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Module A — database certification (independent audit, Part 3).
 *
 * Each test answers ONE specific, previously-unverified claim about
 * production database behaviour, empirically -- not by reasoning about what
 * Dexie/IndexedDB "should" do. The rollback test in particular contradicted
 * an initial assumption (see its comment) and was corrected after directly
 * probing raw IndexedDB and Dexie's actual behaviour outside the test
 * framework first.
 *
 * vi.resetModules() runs before every test so each gets a genuinely fresh
 * `db` singleton -- without it, a db.close() in one test leaves a closed
 * instance cached for the next test's dynamic import, which is a real
 * isolation bug this file originally had (DatabaseClosedError) before being
 * fixed here.
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

describe("Module A — database certification", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("ROLLBACK: reverting the app's code to a v49-only build, after the database has already been upgraded to v50, does not corrupt or hide existing data", async () => {
    const { db } = await import("../../services/db");
    await db.open();
    expect(db.verno).toBe(50);
    await db.patients.add({ id: "P-ROLLBACK-1", name: "Rollback Test", phone: "9000000099", createdAt: "x", updatedAt: "x" } as any);
    db.close();

    const reverted = new V49Only();
    await reverted.open();

    // reverted.verno reflects THIS CLASS's own declared schema (49), not the
    // database's actual on-disk version -- confirmed by probing directly:
    // Dexie encodes its declared version as nativeVersion*10 internally, so
    // the real stored version here is 500 (i.e. Dexie's "50"), reachable via
    // backendDB().version, not via .verno. Opening at a declared version
    // BELOW the stored one does not throw here, unlike a raw
    // `indexedDB.open(name, 49)` against an already-v500 store, which DOES
    // throw VersionError per spec (verified separately, outside this test,
    // by calling the raw API directly) -- Dexie is deliberately more lenient
    // than the raw platform for exactly this scenario.
    expect(reverted.verno).toBe(49);
    expect((reverted as any).backendDB().version).toBe(500);

    // The actual claim that matters: existing v49-shaped data is completely
    // intact and readable by the reverted code.
    const patient = await (reverted as any).patients.get("P-ROLLBACK-1");
    expect(patient).toMatchObject({ id: "P-ROLLBACK-1", name: "Rollback Test" });

    // The reverted code correctly has NO access to appMeta -- it was never in
    // its own declared schema. This is the expected, safe trade-off: rolling
    // back the code loses the NEW feature (origin-identity), never existing
    // clinical data. A reverted build also wouldn't call
    // originIdentityService in the first place, since that code is reverted
    // along with everything else.
    expect(() => (reverted as any).table("appMeta")).toThrow(/does not exist/i);

    reverted.close();
  });

  it("DUPLICATE MIGRATION PROTECTION: opening the same already-migrated database from a second, independent app load does not re-run the upgrade or duplicate data", async () => {
    const firstLoad = await import("../../services/db");
    await firstLoad.db.open();
    await firstLoad.db.patients.add({ id: "P-DUP-1", name: "Dup Test", phone: "9000000098", createdAt: "x", updatedAt: "x" } as any);
    firstLoad.db.close();

    vi.resetModules();
    const secondLoad = await import("../../services/db");
    await secondLoad.db.open();

    expect(secondLoad.db.verno).toBe(50);
    const rows = await secondLoad.db.patients.toArray();
    expect(rows).toHaveLength(1); // not duplicated
    expect(rows[0].id).toBe("P-DUP-1");

    secondLoad.db.close();
  });

  it("SCHEMA INTEGRITY: every table declared through v50 exists and is queryable after the upgrade", async () => {
    const { db } = await import("../../services/db");
    await db.open();

    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      [
        "appMeta",
        "appointments",
        "caseMemory",
        "consultations",
        "drafts",
        "learning",
        "operationalEvents",
        "patients",
        "syncOutbox",
      ].sort()
    );

    for (const name of tableNames) {
      await expect((db as any)[name].count()).resolves.toBeGreaterThanOrEqual(0);
    }

    db.close();
  });

  it("appMeta backfill is idempotent across repeated calls, within one app session", async () => {
    const { checkOriginIdentity } = await import("../../services/originIdentityService");
    const { db } = await import("../../services/db");

    const first = await checkOriginIdentity();
    const second = await checkOriginIdentity();
    const third = await checkOriginIdentity();

    expect(first.status).toBe("first-run");
    expect(second.status).toBe("first-run");
    expect(third.status).toBe("first-run");

    const rows = await db.appMeta.toArray();
    expect(rows).toHaveLength(1); // never duplicated across repeated startup calls

    db.close();
  });
});
