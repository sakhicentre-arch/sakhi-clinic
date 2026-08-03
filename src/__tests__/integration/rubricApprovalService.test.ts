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

let db: typeof import("../../services/db").db;
let svc: typeof import("../../services/rubricApprovalService");

function seedSuggestion(overrides: Partial<Record<string, any>> = {}) {
  return {
    category: "mind" as const,
    text: "Anxiety about health",
    reason: "Directly entered under Mind",
    matchedSentence: "anxious about health",
    confidence: 0.8,
    evidence: "test evidence",
    priority: 1,
    source: "ai" as const,
    ...overrides,
  };
}

describe("rubricApprovalService", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/rubricApprovalService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("insertPendingRubrics persists AI suggestions as pending rows", async () => {
    const entries = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion(), seedSuggestion({ category: "modalities", text: "Worse from cold" })]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.status === "pending" && e.source === "ai")).toBe(true);

    const stored = await db.rubrics.where("consultationId").equals("C1").toArray();
    expect(stored).toHaveLength(2);
  });

  it("approveRubric transitions pending -> approved and stamps decidedAt", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    const approved = await svc.approveRubric(entry.id);
    expect(approved?.status).toBe("approved");
    expect(approved?.decidedAt).toBeTruthy();
  });

  it("rejectRubric transitions pending -> rejected", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    const rejected = await svc.rejectRubric(entry.id);
    expect(rejected?.status).toBe("rejected");
  });

  it("undoRubricDecision reverts approved back to pending and clears decidedAt", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    await svc.approveRubric(entry.id);
    const undone = await svc.undoRubricDecision(entry.id);
    expect(undone?.status).toBe("pending");
    expect(undone?.decidedAt).toBeUndefined();
  });

  it("undoRubricDecision is a no-op for an already-pending rubric", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    expect(await svc.undoRubricDecision(entry.id)).toBeNull();
  });

  it("editRubric only works on a pending rubric", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    const edited = await svc.editRubric(entry.id, { text: "Edited text" });
    expect(edited?.text).toBe("Edited text");

    await svc.approveRubric(entry.id);
    const blockedEdit = await svc.editRubric(entry.id, { text: "Should not apply" });
    expect(blockedEdit).toBeNull();
    expect((await svc.getRubricById(entry.id))?.text).toBe("Edited text");
  });

  it("togglePinRubric works regardless of status", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    const pinned = await svc.togglePinRubric(entry.id, true);
    expect(pinned?.pinned).toBe(true);
  });

  it("deleteRubric soft-deletes -- excluded from list queries but not physically removed", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    await svc.deleteRubric(entry.id);

    expect(await svc.getRubricById(entry.id)).toBeUndefined();
    expect(await svc.listRubricsByConsultation("C1")).toEqual([]);

    const raw = await db.rubrics.get(entry.id);
    expect(raw?.deletedAt).toBeTruthy();
  });

  it("addManualRubric is created already approved, no pending review needed", async () => {
    const entry = await svc.addManualRubric({ consultationId: "C1", patientId: "P1", category: "sleep", text: "Sound sleep, unrefreshing" });
    expect(entry.status).toBe("approved");
    expect(entry.source).toBe("manual");
    expect(entry.decidedAt).toBeTruthy();
  });

  it("mergeRubrics soft-deletes originals and creates one new approved row with an audit pointer", async () => {
    const entries = await svc.insertPendingRubrics("C1", "P1", [
      seedSuggestion({ text: "Worse from cold" }),
      seedSuggestion({ category: "modalities", text: "Worse from damp" }),
    ]);
    await Promise.all(entries.map((e) => svc.approveRubric(e.id)));

    const merged = await svc.mergeRubrics(entries.map((e) => e.id), { category: "modalities", text: "Worse from cold and damp" });
    expect(merged?.text).toBe("Worse from cold and damp");
    expect(merged?.status).toBe("approved");
    expect(merged?.mergedFromIds).toEqual(entries.map((e) => e.id));

    for (const e of entries) {
      expect(await svc.getRubricById(e.id)).toBeUndefined(); // soft-deleted
    }
  });

  it("mergeRubrics requires at least 2 valid ids", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion()]);
    expect(await svc.mergeRubrics([entry.id], { category: "mind", text: "x" })).toBeNull();
  });

  it("splitRubric soft-deletes the original and creates N new approved rows with splitFromId", async () => {
    const [entry] = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion({ text: "Anxious and forsaken feeling" })]);
    await svc.approveRubric(entry.id);

    const parts = await svc.splitRubric(entry.id, [
      { category: "mind", text: "Anxious" },
      { category: "mind", text: "Forsaken feeling" },
    ]);
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.splitFromId === entry.id && p.status === "approved")).toBe(true);
    expect(await svc.getRubricById(entry.id)).toBeUndefined();
  });

  it("listRubricsByStatus and listRubricsByConsultation exclude soft-deleted rows", async () => {
    const entries = await svc.insertPendingRubrics("C1", "P1", [seedSuggestion(), seedSuggestion({ text: "Second" })]);
    await svc.deleteRubric(entries[0].id);

    expect(await svc.listRubricsByStatus("pending")).toHaveLength(1);
    expect(await svc.listRubricsByConsultation("C1")).toHaveLength(1);
  });

  it("listRubricsByPatient returns all of a patient's rubrics across consultations, most recently updated first", async () => {
    await svc.insertPendingRubrics("C1", "P1", [seedSuggestion({ text: "First" })]);
    await new Promise((r) => setTimeout(r, 5));
    await svc.insertPendingRubrics("C2", "P1", [seedSuggestion({ text: "Second" })]);

    const rows = await svc.listRubricsByPatient("P1");
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe("Second");
  });
});
