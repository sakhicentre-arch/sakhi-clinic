import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Production hardening: sakhi.favoriteMedicines.v1 / sakhi.quickNotes.v1
 * (Doctor Productivity) were added to the app but never added to
 * clinicExportService.ts's localStorage allowlist -- they'd silently
 * vanish on backup/restore instead of round-tripping like every other
 * localStorage-backed feature (rxTemplates, remedy defaults, etc).
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
let svc: typeof import("../../services/clinicExportService");

describe("clinicExportService — favoriteMedicines/quickNotes round-trip", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/clinicExportService");

    const store = new Map<string, string>();
    (global as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
    window.localStorage.setItem("sakhi.favoriteMedicines.v1", JSON.stringify(["Arnica Montana"]));
    window.localStorage.setItem("sakhi.quickNotes.v1", JSON.stringify({ p1: "Prefers evening slots" }));
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("includes both keys in the exported bundle's storage field", async () => {
    const bundle = await svc.exportClinicBundle();
    expect(bundle.storage?.["sakhi.favoriteMedicines.v1"]).toBe(JSON.stringify(["Arnica Montana"]));
    expect(bundle.storage?.["sakhi.quickNotes.v1"]).toBe(JSON.stringify({ p1: "Prefers evening slots" }));
  });

  it("restores both keys on import (overwrite mode)", async () => {
    const bundle = await svc.exportClinicBundle();
    window.localStorage.clear();
    expect(window.localStorage.getItem("sakhi.favoriteMedicines.v1")).toBeNull();

    await svc.importClinicBundleWithOptions(bundle, { mode: "overwrite" });

    expect(window.localStorage.getItem("sakhi.favoriteMedicines.v1")).toBe(JSON.stringify(["Arnica Montana"]));
    expect(window.localStorage.getItem("sakhi.quickNotes.v1")).toBe(JSON.stringify({ p1: "Prefers evening slots" }));
  });
});
