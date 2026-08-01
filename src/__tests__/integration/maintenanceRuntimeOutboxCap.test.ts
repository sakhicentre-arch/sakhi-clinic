import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Module A — acceptance criterion A5, corrected wiring.
 *
 * Certification-pass finding: enforceOutboxCap was originally called
 * synchronously from enqueueOutbox, on the same await chain as every
 * patient/appointment/consultation save. Measured cost at the real
 * 10,000-row cap was 100+ seconds in this harness -- unacceptable inside a
 * clinical write. It has been moved to maintenanceRuntimeService.ts's
 * periodic background run (already invoked every 5 minutes and once at app
 * start, entirely outside any clinical write's await chain). This file
 * proves the NEW wiring; outboxCap.test.ts proves enqueueOutbox does NOT do
 * this anymore.
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

describe("Module A — outbox cap enforced via the maintenance runtime, not the write path", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("runMaintenanceOnce() calls enforceOutboxCap and reports the result", async () => {
    const { db } = await import("../../services/db");
    await db.open();

    const { DEFAULT_MAINTENANCE_POLICIES } = await import("../../services/maintenancePolicies");
    const original = DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries;
    DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries = 5;

    try {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        id: `OB-${i}`,
        entityType: "patient" as const,
        entityId: `P-${i}`,
        operationType: "create" as const,
        payload: {},
        version: 1,
        deviceId: "d1",
        timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        syncStatus: "synced" as const,
        retryCount: 0,
      }));
      await db.syncOutbox.bulkAdd(rows);
      expect(await db.syncOutbox.count()).toBe(10);

      const { runMaintenanceOnce } = await import("../../services/maintenanceRuntimeService");
      const result = await runMaintenanceOnce({ reason: "manual" });

      expect(result.actions.cappedOutbox).toBeGreaterThan(0);
      expect(await db.syncOutbox.count()).toBeLessThanOrEqual(5);
    } finally {
      DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries = original;
    }

    db.close();
  });

  it("a single enqueueOutbox call, even far over cap, completes quickly -- proving the expensive path no longer runs inline", async () => {
    const { db } = await import("../../services/db");
    await db.open();
    const { enqueueOutbox } = await import("../../services/outboxService");

    const rows = Array.from({ length: 2000 }, (_, i) => ({
      id: `OB-${i}`,
      entityType: "patient" as const,
      entityId: `P-${i}`,
      operationType: "create" as const,
      payload: {},
      version: 1,
      deviceId: "d1",
      timestamp: new Date(2026, 0, 1, 0, 0, 0, i).toISOString(),
      syncStatus: "synced" as const,
      retryCount: 0,
    }));
    await db.syncOutbox.bulkAdd(rows);

    const { DEFAULT_MAINTENANCE_POLICIES } = await import("../../services/maintenancePolicies");
    const original = DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries;
    DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries = 10; // outbox is now 200x over cap

    try {
      const t0 = performance.now();
      await enqueueOutbox({ entityType: "patient", entityId: "NEW", operationType: "create", payload: {}, version: 1 });
      const ms = performance.now() - t0;

      // A single write must stay fast regardless of how far over cap the
      // outbox already is -- proof that enqueueOutbox no longer scans/prunes.
      expect(ms).toBeLessThan(500);
    } finally {
      DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries = original;
    }

    db.close();
  }, 15000);
});
