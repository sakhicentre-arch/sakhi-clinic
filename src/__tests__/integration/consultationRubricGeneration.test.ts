import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * RC2 Phase 1 -- Rubric Intelligence Engine, Phase 7: proves
 * saveConsultation() is the real trigger for rubric generation (mirroring
 * the existing learnedAt/learnFromConsultation background pattern
 * exactly), not something only wired up in a UI component that could
 * silently be the only caller. Runs once per consultation regardless of
 * which page calls saveConsultation() -- QuickConsultationPage and
 * ConsultationPage both benefit without either needing its own trigger.
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
let consultationSvc: typeof import("../../services/consultationService");

describe("consultationService.saveConsultation — rubric generation trigger", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    consultationSvc = await import("../../services/consultationService");

    await db.patients.add({
      id: "P1", name: "Rubric Trigger Patient", gender: "Female", phone: "9000000001", age: 30,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("generates pending rubrics in the background after a consultation with matchable content is saved", async () => {
    const ok = await consultationSvc.saveConsultation({
      id: "C1", patientId: "P1", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Headache worse from sun exposure", caseText: "",
      mind: "irritable, weeping", medicines: [], outcome: "NoChange" as any,
    } as any);
    expect(ok).toBe(true);

    await vi.waitFor(async () => {
      const rubrics = await db.rubrics.where("consultationId").equals("C1").toArray();
      expect(rubrics.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const rubrics = await db.rubrics.where("consultationId").equals("C1").toArray();
    expect(rubrics.every((r) => r.status === "pending" && r.source === "ai")).toBe(true);
    expect(rubrics.some((r) => r.category === "mind")).toBe(true);
  });

  it("stamps rubricsGeneratedAt on the consultation once generation completes", async () => {
    await consultationSvc.saveConsultation({
      id: "C1", patientId: "P1", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Worse from cold", caseText: "", medicines: [], outcome: "NoChange" as any,
    } as any);

    await vi.waitFor(async () => {
      const stored = await db.consultations.get("C1");
      expect(stored?.rubricsGeneratedAt).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("does not regenerate duplicate rubrics when an already-processed consultation is saved again", async () => {
    await consultationSvc.saveConsultation({
      id: "C1", patientId: "P1", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Worse from cold", caseText: "", medicines: [], outcome: "NoChange" as any,
    } as any);
    await vi.waitFor(async () => {
      expect((await db.consultations.get("C1"))?.rubricsGeneratedAt).toBeTruthy();
    }, { timeout: 3000 });
    const firstCount = (await db.rubrics.where("consultationId").equals("C1").toArray()).length;
    expect(firstCount).toBeGreaterThan(0);

    // Re-save the SAME consultation (now carrying rubricsGeneratedAt, same
    // as a real edit-and-resave would via consultationToForm's round-trip).
    const stored = await db.consultations.get("C1");
    await consultationSvc.saveConsultation(stored as any);

    // Give any (incorrectly re-fired) background generation a moment to
    // run, then confirm the count is unchanged.
    await new Promise((r) => setTimeout(r, 200));
    const secondCount = (await db.rubrics.where("consultationId").equals("C1").toArray()).length;
    expect(secondCount).toBe(firstCount);
  });

  it("generates no rubrics for a consultation with no matchable content, and still completes the save", async () => {
    const ok = await consultationSvc.saveConsultation({
      id: "C1", patientId: "P1", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Routine checkup", caseText: "", medicines: [], outcome: "NoChange" as any,
    } as any);
    expect(ok).toBe(true);

    await vi.waitFor(async () => {
      expect((await db.consultations.get("C1"))?.rubricsGeneratedAt).toBeTruthy();
    }, { timeout: 3000 });
    expect(await db.rubrics.where("consultationId").equals("C1").toArray()).toEqual([]);
  });
});
