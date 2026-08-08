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
let svc: typeof import("../../services/rubricAnalyticsService");

function rubric(overrides: Partial<Record<string, any>>) {
  const now = new Date().toISOString();
  return {
    id: overrides.id, consultationId: "C1", patientId: "P1", category: "mind",
    text: "x", source: "ai", status: "pending", createdAt: now, updatedAt: now,
    ...overrides,
  };
}

describe("rubricAnalyticsService.getRubricDashboardSummary", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/rubricAnalyticsService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("returns zeroed/empty summary for an empty table", async () => {
    const summary = await svc.getRubricDashboardSummary();
    expect(summary).toEqual({
      pendingCount: 0, recentlyApproved: [], manualCount: 0,
      aiConfidenceAvgPercent: null, mostCommon: [], todayCount: 0, approvedTodayCount: 0,
    });
  });

  it("counts pending, manual, and today's rubrics correctly", async () => {
    await db.rubrics.bulkAdd([
      rubric({ id: "R1", status: "pending" }),
      rubric({ id: "R2", status: "pending", source: "manual" }),
      rubric({ id: "R3", status: "approved" }),
    ] as any);

    const summary = await svc.getRubricDashboardSummary();
    expect(summary.pendingCount).toBe(2);
    expect(summary.manualCount).toBe(1);
    expect(summary.todayCount).toBe(3);
  });

  it("computes AI confidence average across approved AI rubrics only", async () => {
    await db.rubrics.bulkAdd([
      rubric({ id: "R1", status: "approved", source: "ai", confidence: 0.8 }),
      rubric({ id: "R2", status: "approved", source: "ai", confidence: 0.6 }),
      rubric({ id: "R3", status: "approved", source: "manual" }), // no confidence, excluded
      rubric({ id: "R4", status: "pending", source: "ai", confidence: 0.9 }), // not approved, excluded
    ] as any);

    const summary = await svc.getRubricDashboardSummary();
    expect(summary.aiConfidenceAvgPercent).toBe(70); // (0.8+0.6)/2 = 0.7
  });

  it("ranks mostCommon categories by count, descending", async () => {
    await db.rubrics.bulkAdd([
      rubric({ id: "R1", category: "modalities" }),
      rubric({ id: "R2", category: "modalities" }),
      rubric({ id: "R3", category: "mind" }),
    ] as any);

    const summary = await svc.getRubricDashboardSummary();
    expect(summary.mostCommon[0]).toMatchObject({ category: "modalities", count: 2 });
    expect(summary.mostCommon[1]).toMatchObject({ category: "mind", count: 1 });
  });

  it("excludes soft-deleted rubrics from every metric", async () => {
    await db.rubrics.bulkAdd([
      rubric({ id: "R1", status: "pending" }),
      rubric({ id: "R2", status: "pending", deletedAt: Date.now() }),
    ] as any);

    const summary = await svc.getRubricDashboardSummary();
    expect(summary.pendingCount).toBe(1);
    expect(summary.todayCount).toBe(1);
  });

  it("counts approvedTodayCount only for rubrics decided today", async () => {
    await db.rubrics.bulkAdd([
      rubric({ id: "R1", status: "approved", decidedAt: new Date().toISOString() }),
      rubric({ id: "R2", status: "approved", decidedAt: "2020-01-01T00:00:00.000Z" }),
    ] as any);

    const summary = await svc.getRubricDashboardSummary();
    expect(summary.approvedTodayCount).toBe(1);
  });
});
