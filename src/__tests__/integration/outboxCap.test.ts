import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

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
let enqueueOutbox: typeof import("../../services/outboxService").enqueueOutbox;
let enforceOutboxCap: typeof import("../../services/outboxMaintenanceService").enforceOutboxCap;

describe("Module A — acceptance criterion A5: syncOutbox row count stays capped", () => {
  beforeEach(async () => {
    await resetDatabase();
    const dbModule = await import("../../services/db");
    const outboxModule = await import("../../services/outboxService");
    const maintenanceModule = await import("../../services/outboxMaintenanceService");
    db = dbModule.db;
    enqueueOutbox = outboxModule.enqueueOutbox;
    enforceOutboxCap = maintenanceModule.enforceOutboxCap;
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("never lets syncOutbox exceed a configured cap under sustained enqueue volume", async () => {
    const CAP = 50; // small cap for test speed; the mechanism is size-independent

    for (let i = 0; i < CAP * 3; i++) {
      await enqueueOutbox({
        entityType: "patient",
        entityId: `P-${i}`,
        operationType: "create",
        payload: { id: `P-${i}` },
        version: 1,
      });
      // Directly enforce the small test cap on every write, since production
      // code enforces the real 10,000 default -- this exercises the same
      // enforceOutboxCap() function under a cap small enough to actually bite
      // within a fast test.
      await enforceOutboxCap(CAP);
      const count = await db.syncOutbox.count();
      expect(count).toBeLessThanOrEqual(CAP);
    }

    // Post-certification fix: prunes to 90% of the cap (a hysteresis buffer),
    // not to exactly the cap -- see enforceOutboxCap's own comment for why.
    const finalCount = await db.syncOutbox.count();
    expect(finalCount).toBeLessThanOrEqual(CAP);
    expect(finalCount).toBeGreaterThanOrEqual(Math.floor(CAP * 0.9) - 1);
  });

  it("HYSTERESIS: after one prune, several subsequent writes do not immediately re-trigger a full prune scan", async () => {
    // This is the actual point of pruning to 90% rather than exactly 100%:
    // a full enforceOutboxCap() run at the real 10,000-row cap measured 100+
    // SECONDS in this harness (see perfMeasurement.test.ts and
    // outboxMaintenanceService.ts's module comment) -- pruning to exactly the
    // cap would mean the very next single write re-triggers that cost.
    // Pruning to 90% buys headroom between expensive runs; it does not make
    // any individual run cheap (that's why enforcement was moved off the
    // clinical write path entirely -- see maintenanceRuntimeOutboxCap.test.ts).
    // enqueueOutbox no longer enforces the cap on its own (also corrected
    // during certification), so enforceOutboxCap(CAP) is called explicitly
    // here, matching the pattern of the other tests in this file.
    const CAP = 50;
    for (let i = 0; i < CAP; i++) {
      await enqueueOutbox({ entityType: "patient", entityId: `SEED-${i}`, operationType: "create", payload: {}, version: 1 });
    }
    // One more write crosses the cap and triggers the first prune, down to ~45.
    await enqueueOutbox({ entityType: "patient", entityId: "TRIGGER", operationType: "create", payload: {}, version: 1 });
    await enforceOutboxCap(CAP);
    const afterFirstPrune = await db.syncOutbox.count();
    expect(afterFirstPrune).toBeLessThan(CAP);

    const buffer = CAP - afterFirstPrune;
    expect(buffer).toBeGreaterThan(1); // there is real headroom, not zero

    // Writing exactly `buffer` more rows should NOT cross the cap again.
    for (let i = 0; i < buffer; i++) {
      await enqueueOutbox({ entityType: "patient", entityId: `FILL-${i}`, operationType: "create", payload: {}, version: 1 });
    }
    await enforceOutboxCap(CAP);
    expect(await db.syncOutbox.count()).toBeLessThanOrEqual(CAP);
  });

  it("prunes synced entries before pending ones, down to the hysteresis target (90% of cap)", async () => {
    for (let i = 0; i < 10; i++) {
      await enqueueOutbox({
        entityType: "patient",
        entityId: `SYNCED-${i}`,
        operationType: "create",
        payload: {},
        version: 1,
        syncStatus: "synced",
      });
    }
    for (let i = 0; i < 5; i++) {
      await enqueueOutbox({
        entityType: "patient",
        entityId: `PENDING-${i}`,
        operationType: "create",
        payload: {},
        version: 1,
        syncStatus: "pending",
      });
    }

    // 15 total, cap 5 -> target floor(5*0.9)=4 -> excess=11: all 10 synced,
    // plus the single oldest pending row (PENDING-0), to reach the target.
    const deleted = await enforceOutboxCap(5);
    expect(deleted).toBe(11);

    const remaining = await db.syncOutbox.toArray();
    expect(remaining).toHaveLength(4);
    expect(remaining.every((r) => r.syncStatus === "pending")).toBe(true);
    expect(remaining.find((r) => r.entityId === "PENDING-0")).toBeUndefined();
  });

  it("falls back to oldest overall once synced entries are exhausted, down to the hysteresis target", async () => {
    for (let i = 0; i < 3; i++) {
      await enqueueOutbox({
        entityType: "patient",
        entityId: `SYNCED-${i}`,
        operationType: "create",
        payload: {},
        version: 1,
        syncStatus: "synced",
        timestamp: `2026-01-0${i + 1}T00:00:00.000Z`,
      });
    }
    for (let i = 0; i < 5; i++) {
      await enqueueOutbox({
        entityType: "patient",
        entityId: `PENDING-${i}`,
        operationType: "create",
        payload: {},
        version: 1,
        syncStatus: "pending",
        timestamp: `2026-02-0${i + 1}T00:00:00.000Z`,
      });
    }

    // 8 total, cap 4 -> target floor(4*0.9)=3 -> excess=5: all 3 synced,
    // plus the 2 oldest pending rows (PENDING-0, PENDING-1).
    const deleted = await enforceOutboxCap(4);
    expect(deleted).toBe(5);

    const remaining = await db.syncOutbox.toArray();
    expect(remaining).toHaveLength(3);
    expect(remaining.find((r) => r.entityId === "PENDING-0")).toBeUndefined();
    expect(remaining.find((r) => r.entityId === "PENDING-1")).toBeUndefined();
    expect(remaining.find((r) => r.entityId === "PENDING-4")).toBeDefined(); // newest pending, kept
  });

  it("does nothing when under the cap", async () => {
    await enqueueOutbox({ entityType: "patient", entityId: "P-1", operationType: "create", payload: {}, version: 1 });
    const deleted = await enforceOutboxCap(1000);
    expect(deleted).toBe(0);
    expect(await db.syncOutbox.count()).toBe(1);
  });

  it("enqueueOutbox does NOT enforce the cap itself — that would put enforceOutboxCap's cost inside every clinical save's await chain", async () => {
    // Certification-pass finding: enforceOutboxCap was originally wired into
    // enqueueOutbox directly. Measured cost at the real 10,000-row cap was
    // 100+ seconds in this harness even after chunking the delete -- wiring
    // that into the same await chain as every patient/appointment/consultation
    // save (enqueueOutbox is called from inside each of those services' write
    // transactions) would have stalled a clinical save for over a minute the
    // moment the outbox crossed its cap. This test locks in the correction:
    // enqueueOutbox only writes the row, nothing else.
    const { DEFAULT_MAINTENANCE_POLICIES } = await import("../../services/maintenancePolicies");
    const original = DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries;
    DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries = 3;
    try {
      for (let i = 0; i < 10; i++) {
        await enqueueOutbox({
          entityType: "patient",
          entityId: `AUTO-${i}`,
          operationType: "create",
          payload: {},
          version: 1,
        });
      }
      // Unenforced: the outbox is allowed to exceed the cap here. Enforcement
      // is the periodic background maintenance runtime's job (see
      // maintenanceRuntimeService.test.ts), not enqueueOutbox's.
      const count = await db.syncOutbox.count();
      expect(count).toBe(10);
    } finally {
      DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries = original;
    }
  });
});
