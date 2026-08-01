import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Module A — certification audit finding: ensureAppMeta() in
 * originIdentityService.ts has the identical check-then-write shape that
 * appointmentService.ts's slot-booking race had before it was fixed
 * (db.appMeta.get(...) followed by a separate db.appMeta.put(...), not
 * inside one transaction). React 18 StrictMode double-invokes effects on
 * mount in development, so App.tsx's checkOriginIdentity() call on the
 * origin-identity effect can genuinely fire twice in quick succession on a
 * cold start. This proves whether that race is real before deciding on a fix.
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

describe("Module A — originIdentityService concurrency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("two concurrent first-run calls (simulating StrictMode double-invoke) must not silently overwrite each other's installId", async () => {
    // checkOriginIdentity()'s own return value never exposes installId (by
    // design -- it's internal backup-provenance metadata), so a naive
    // "rows.length === 1" assertion here would pass trivially regardless of
    // whether the race is real, since appMeta's key is a fixed singleton and
    // put() always upserts to one row either way. The actual race is: do two
    // concurrent callers' in-memory `meta` objects (used internally, e.g. for
    // the operational-event log) each believe a DIFFERENT installId is
    // canonical, one of which was silently discarded by the other's write.
    // Spying on db.appMeta.put lets us see both racing writes directly.
    const { db } = await import("../../services/db");
    const putSpy = vi.spyOn(db.appMeta, "put");

    // Reach into the module's internal ensureAppMeta race window by calling
    // the public entry point twice concurrently -- this is the same call
    // shape App.tsx's effect would produce under StrictMode double-invoke.
    const { checkOriginIdentity } = await import("../../services/originIdentityService");
    await Promise.all([checkOriginIdentity(), checkOriginIdentity()]);

    // With the transaction fix, IndexedDB serializes the two concurrent rw
    // transactions on appMeta: the second call's read sees the first call's
    // already-committed row and takes the "existing, return it" path, so
    // put() is called at most once.
    expect(putSpy.mock.calls.length).toBeLessThanOrEqual(1);

    const rows = await db.appMeta.toArray();
    expect(rows).toHaveLength(1);
  });
});
