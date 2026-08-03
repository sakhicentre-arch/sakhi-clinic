import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Rubric Intelligence Engine (RC2 Phase 1), Phase 8: covers the three
 * remaining thin Intelligence Layer services -- rubricHistoryService,
 * rubricSearchService, and exportRubricsCsv (re-exported by
 * rubricExportService.ts, tested here against its real implementation in
 * csvExportService.ts).
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

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

let db: typeof import("../../services/db").db;
let approvalSvc: typeof import("../../services/rubricApprovalService");
let historySvc: typeof import("../../services/rubricHistoryService");
let searchSvc: typeof import("../../services/rubricSearchService");
let csvSvc: typeof import("../../services/csvExportService");

describe("Rubric Intelligence Engine — history, search, export", () => {
  let capturedBlob: Blob | null = null;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    approvalSvc = await import("../../services/rubricApprovalService");
    historySvc = await import("../../services/rubricHistoryService");
    searchSvc = await import("../../services/rubricSearchService");
    csvSvc = await import("../../services/csvExportService");

    capturedBlob = null;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => { capturedBlob = blob; return "blob:mock-url"; }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await db.patients.add({ id: "P1", name: "History Test Patient", gender: "Female", phone: "9000000000" } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("rubricHistoryService", () => {
    it("getRecentlyApprovedRubrics returns only approved, most recently decided first", async () => {
      const entries = await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "mind", text: "First", reason: "r", matchedSentence: "s", confidence: 0.7, evidence: "e", priority: 1, source: "ai" },
        { category: "sleep", text: "Second", reason: "r", matchedSentence: "s", confidence: 0.7, evidence: "e", priority: 2, source: "ai" },
      ]);
      await approvalSvc.approveRubric(entries[0].id);
      await new Promise((r) => setTimeout(r, 5));
      await approvalSvc.approveRubric(entries[1].id);
      await approvalSvc.rejectRubric((await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "mind", text: "Rejected one", reason: "r", matchedSentence: "s", confidence: 0.7, evidence: "e", priority: 3, source: "ai" },
      ]))[0].id);

      const recent = await historySvc.getRecentlyApprovedRubrics(10);
      expect(recent).toHaveLength(2);
      expect(recent[0].text).toBe("Second");
      expect(recent.every((r) => r.status === "approved")).toBe(true);
    });

    it("getRubricAuditTrail reconstructs merge lineage including soft-deleted originals", async () => {
      const entries = await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "modalities", text: "Worse from cold", reason: "r", matchedSentence: "s", confidence: 0.6, evidence: "e", priority: 1, source: "ai" },
        { category: "modalities", text: "Worse from damp", reason: "r", matchedSentence: "s", confidence: 0.6, evidence: "e", priority: 2, source: "ai" },
      ]);
      await Promise.all(entries.map((e) => approvalSvc.approveRubric(e.id)));
      const merged = await approvalSvc.mergeRubrics(entries.map((e) => e.id), { category: "modalities", text: "Worse from cold and damp" });

      const trail = await historySvc.getRubricAuditTrail(merged!.id);
      expect(trail?.mergedFrom).toHaveLength(2);
      expect(trail?.mergedFrom.map((r) => r.text).sort()).toEqual(["Worse from cold", "Worse from damp"]);
      expect(trail?.splitFrom).toBeNull();
    });

    it("getRubricAuditTrail returns null for a nonexistent id", async () => {
      expect(await historySvc.getRubricAuditTrail("does-not-exist")).toBeNull();
    });
  });

  describe("rubricSearchService", () => {
    it("finds rubrics by text substring, ranking prefix matches first", async () => {
      await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "mind", text: "Anxiety about health", reason: "r", matchedSentence: "s", confidence: 0.7, evidence: "e", priority: 1, source: "ai" },
        { category: "mind", text: "Health anxiety generally", reason: "r", matchedSentence: "s", confidence: 0.7, evidence: "e", priority: 2, source: "ai" },
      ]);

      const results = await searchSvc.searchRubrics("health");
      expect(results).toHaveLength(2);
      expect(results[0].text).toBe("Health anxiety generally"); // starts-with beats includes
    });

    it("finds rubrics by category", async () => {
      await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "modalities", text: "Worse from cold", reason: "r", matchedSentence: "s", confidence: 0.6, evidence: "e", priority: 1, source: "ai" },
      ]);
      const results = await searchSvc.searchRubrics("modalities");
      expect(results).toHaveLength(1);
    });

    it("excludes soft-deleted rubrics", async () => {
      const [entry] = await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "mind", text: "Anxiety about health", reason: "r", matchedSentence: "s", confidence: 0.7, evidence: "e", priority: 1, source: "ai" },
      ]);
      await approvalSvc.deleteRubric(entry.id);
      expect(await searchSvc.searchRubrics("anxiety")).toEqual([]);
    });

    it("returns an empty array for a blank query", async () => {
      expect(await searchSvc.searchRubrics("   ")).toEqual([]);
    });
  });

  describe("exportRubricsCsv (via csvExportService.ts, re-exported by rubricExportService.ts)", () => {
    it("exports non-deleted rubrics with patient name and confidence as a percentage", async () => {
      const [entry] = await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "mind", text: "Anxiety about health", reason: "AI reason", matchedSentence: "s", confidence: 0.82, evidence: "e", priority: 1, source: "ai" },
      ]);
      await approvalSvc.approveRubric(entry.id);
      const deleted = (await approvalSvc.insertPendingRubrics("C1", "P1", [
        { category: "sleep", text: "Should not appear", reason: "r", matchedSentence: "s", confidence: 0.5, evidence: "e", priority: 2, source: "ai" },
      ]))[0];
      await approvalSvc.deleteRubric(deleted.id);

      await csvSvc.exportRubricsCsv();

      expect(capturedBlob).not.toBeNull();
      const text = await readBlobAsText(capturedBlob!);
      expect(text).toContain("createdAt,patientName,consultationId,category,text,source,status,confidence,reason,doctorNote");
      expect(text).toContain("History Test Patient");
      expect(text).toContain("Anxiety about health");
      expect(text).toContain("82"); // confidence as a rounded percentage
      expect(text).not.toContain("Should not appear");
    });
  });
});
