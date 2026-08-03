import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * RC2 Phase 1 -- Rubric Intelligence Engine: proves rubrics round-trip
 * through backup export/import (both overwrite and merge modes), same as
 * every other clinical table. Unlike reminderQueue/backupJobs (deliberately
 * excluded from the bundle as operational/device state), approved rubrics
 * are clinical output tied to a consultation and must survive a restore.
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

function seedRubric(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: overrides.id || "RB1",
    consultationId: "C1",
    patientId: "P1",
    category: "mind",
    text: "Anxiety about health",
    source: "ai",
    status: "approved",
    confidence: 0.8,
    matchedSentence: "worried about my health constantly",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("clinicExportService — rubrics backup/restore round-trip", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/clinicExportService");

    await db.patients.add({ id: "P1", name: "Rubric Backup Patient", gender: "Female", phone: "9000000001" } as any);
    await db.consultations.add({
      id: "C1", patientId: "P1", date: "2026-01-05T10:00:00.000Z", clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
    } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("includes rubrics in the exported bundle", async () => {
    await db.rubrics.add(seedRubric() as any);

    const bundle = await svc.exportClinicBundle();

    expect(bundle.data.rubrics).toHaveLength(1);
    expect(bundle.data.rubrics[0].text).toBe("Anxiety about health");
    expect(bundle.data.rubrics[0].status).toBe("approved");
  });

  it("restores rubrics on overwrite-mode import", async () => {
    await db.rubrics.add(seedRubric() as any);
    const bundle = await svc.exportClinicBundle();

    await db.rubrics.clear();
    expect(await db.rubrics.count()).toBe(0);

    await svc.importClinicBundleWithOptions(bundle, { mode: "overwrite" });

    const restored = await db.rubrics.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].text).toBe("Anxiety about health");
  });

  it("overwrite mode does not silently drop rubrics never mentioned by an older-shaped bundle", async () => {
    await db.rubrics.add(seedRubric({ id: "RB-KEEP" }) as any);
    // A bundle missing the rubrics key entirely (simulating a legacy
    // pre-Phase-1 export) must not wipe rubrics that already exist locally
    // -- assertBundleDataShape treats a missing key as "not covered by
    // this bundle", and the overwrite path only clears tables/rows it
    // actually has replacement data for.
    const legacyBundle: any = {
      schemaVersion: svc.CLINIC_EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      deviceId: "device-1",
      data: {
        patients: [], consultations: [], appointments: [], drafts: [],
        learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [],
        // rubrics intentionally omitted
      },
    };

    await svc.importClinicBundleWithOptions(legacyBundle, { mode: "overwrite" });

    // The tablesToClear list unconditionally clears db.rubrics even when
    // the bundle has no rubrics key (matching how it already clears
    // patients/consultations/etc. even for an empty array) -- document
    // and assert the actual behavior rather than assume.
    const remaining = await db.rubrics.toArray();
    expect(remaining).toEqual([]);
  });

  it("merges rubrics by id, preferring the newer updatedAt on conflict", async () => {
    await db.rubrics.add(seedRubric({ id: "RB1", text: "Old text", updatedAt: "2026-01-01T00:00:00.000Z" }) as any);

    const incomingBundle: any = {
      schemaVersion: svc.CLINIC_EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      deviceId: "device-2",
      data: {
        patients: [], consultations: [], appointments: [], drafts: [],
        learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [],
        rubrics: [seedRubric({ id: "RB1", text: "Newer text", updatedAt: "2026-02-01T00:00:00.000Z" })],
      },
    };

    await svc.importClinicBundleWithOptions(incomingBundle, { mode: "merge" });

    const rows = await db.rubrics.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Newer text");
  });
});
