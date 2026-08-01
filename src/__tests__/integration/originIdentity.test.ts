import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function setLocationOrigin(origin: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, origin, href: origin + "/" },
    writable: true,
    configurable: true,
  });
}

describe("Module A — originIdentityService", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    setLocationOrigin("https://sakhi-clinic.example");
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("first call after a fresh install/upgrade backfills the baseline and reports first-run, never mismatch", async () => {
    const { checkOriginIdentity } = await import("../../services/originIdentityService");
    const { db } = await import("../../services/db");

    const result = await checkOriginIdentity();

    expect(result.status).toBe("first-run");
    expect(result.currentOrigin).toBe("https://sakhi-clinic.example");

    const stored = await db.appMeta.get("app-meta");
    expect(stored?.firstRunOrigin).toBe("https://sakhi-clinic.example");
    expect(stored?.baselineIsPostUpgrade).toBe(true);
    expect(stored?.installId).toBeTruthy();
  });

  it("a subsequent call on the SAME origin, after the baseline is confirmed, reports match", async () => {
    const { checkOriginIdentity, acknowledgeOriginChange } = await import("../../services/originIdentityService");

    await checkOriginIdentity(); // first-run, sets baseline
    await acknowledgeOriginChange(); // confirms it as a real baseline, clears the post-upgrade flag

    const result = await checkOriginIdentity();
    expect(result.status).toBe("match");
  });

  it("a call from a DIFFERENT origin than the confirmed baseline reports mismatch, and does not throw or block", async () => {
    const { checkOriginIdentity, acknowledgeOriginChange } = await import("../../services/originIdentityService");

    await checkOriginIdentity();
    await acknowledgeOriginChange();

    setLocationOrigin("https://sakhi-clinic-staging.example");
    const result = await checkOriginIdentity();

    expect(result.status).toBe("mismatch");
    expect(result.currentOrigin).toBe("https://sakhi-clinic-staging.example");
    expect(result.recordedOrigin).toBe("https://sakhi-clinic.example");
  });

  it("acknowledgeOriginChange updates the baseline so the mismatch does not reappear", async () => {
    const { checkOriginIdentity, acknowledgeOriginChange } = await import("../../services/originIdentityService");

    await checkOriginIdentity();
    await acknowledgeOriginChange();

    setLocationOrigin("https://sakhi-clinic-v2.example");
    const mismatch = await checkOriginIdentity();
    expect(mismatch.status).toBe("mismatch");

    await acknowledgeOriginChange();
    const afterAck = await checkOriginIdentity();
    expect(afterAck.status).toBe("match");
    expect(afterAck.recordedOrigin).toBe("https://sakhi-clinic-v2.example");
  });

  it("never throws even if the underlying db call fails", async () => {
    const { checkOriginIdentity } = await import("../../services/originIdentityService");
    const { db } = await import("../../services/db");

    vi.spyOn(db.appMeta, "get").mockRejectedValueOnce(new Error("simulated db failure"));

    await expect(checkOriginIdentity()).resolves.toMatchObject({ status: "first-run" });
  });
});
