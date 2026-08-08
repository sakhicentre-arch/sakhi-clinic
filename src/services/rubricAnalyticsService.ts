/**
 * rubricAnalyticsService.ts — Rubric Intelligence Engine (RC2 Phase 1),
 * Phases 9-10: dashboard/report aggregation.
 *
 * Follows paymentService.ts's established convention: one function per
 * report shape, reading from db.rubrics directly, returning a plain
 * typed object -- computed once, reused by both the Dashboard widget and
 * (later) Reports. No business logic duplicated between callers.
 */

import { db, RubricCategory, RubricEntry } from "./db";
import { RUBRIC_CATEGORY_LABELS } from "../data/rubricVocabulary";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export interface RubricDashboardSummary {
  pendingCount: number;
  recentlyApproved: RubricEntry[];
  manualCount: number;
  aiConfidenceAvgPercent: number | null;
  mostCommon: { category: RubricCategory; label: string; count: number }[];
  todayCount: number;
  approvedTodayCount: number;
}

/** Single pass over all non-deleted rubrics -- every Dashboard widget the
 * doctor asked for (Pending Reviews, Recently Approved, Manual Rubrics,
 * AI Confidence, Most Common Rubrics, Today's Rubrics, Doctor
 * Productivity) is a field on this one summary, same "fetch once, bucket
 * into several results" shape as getPaymentDashboardDrilldowns. */
export async function getRubricDashboardSummary(): Promise<RubricDashboardSummary> {
  const rows = await db.rubrics.filter((r) => !r.deletedAt).toArray();

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const manual = rows.filter((r) => r.source === "manual");
  const aiApproved = approved.filter((r) => r.source === "ai" && typeof r.confidence === "number");

  const recentlyApproved = [...approved]
    .sort((a, b) => (b.decidedAt || b.updatedAt).localeCompare(a.decidedAt || a.updatedAt))
    .slice(0, 5);

  const aiConfidenceAvgPercent = aiApproved.length > 0
    ? Math.round((aiApproved.reduce((sum, r) => sum + (r.confidence || 0), 0) / aiApproved.length) * 100)
    : null;

  const categoryCounts = new Map<RubricCategory, number>();
  for (const r of rows) categoryCounts.set(r.category, (categoryCounts.get(r.category) || 0) + 1);
  const mostCommon = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, label: RUBRIC_CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const todayCount = rows.filter((r) => isToday(r.createdAt)).length;
  const approvedTodayCount = approved.filter((r) => r.decidedAt && isToday(r.decidedAt)).length;

  return {
    pendingCount: pending.length,
    recentlyApproved,
    manualCount: manual.length,
    aiConfidenceAvgPercent,
    mostCommon,
    todayCount,
    approvedTodayCount,
  };
}
