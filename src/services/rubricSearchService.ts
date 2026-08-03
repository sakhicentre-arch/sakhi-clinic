/**
 * rubricSearchService.ts — Rubric Intelligence Engine (RC2 Phase 1),
 * Phase 8: Intelligence Layer service.
 *
 * Single responsibility: free-text search across rubrics, for both the
 * Rubric Review page's own search box and CommandPalette.tsx's global
 * search (Phase 11). Same score() shape as CommandPalette's local scoring
 * helper (startsWith beats includes beats no-match) so ranking behavior
 * feels consistent across the app's various search surfaces without
 * literally sharing code across a UI component and a service module.
 */

import { db, RubricEntry } from "./db";

function score(haystack: string, query: string): number {
  const h = haystack.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (h.startsWith(q)) return 0;
  if (h.includes(q)) return 1;
  return 999;
}

export interface RubricSearchResult {
  rubric: RubricEntry;
  patientName?: string;
}

/**
 * Searches rubric text and category against a query, across all
 * non-deleted rubrics. Deliberately scans in-memory rather than using a
 * Dexie index (Dexie has no substring/full-text index support) -- see
 * RUBRIC_ENGINE_TEST_REPORT.md's performance section for the 100k-row
 * scale check this assumption was validated against.
 */
export async function searchRubrics(query: string, limit = 20): Promise<RubricEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rows = await db.rubrics.filter((r) => !r.deletedAt).toArray();
  return rows
    .map((r) => ({ r, s: Math.min(score(r.text, trimmed), score(r.category, trimmed)) }))
    .filter(({ s }) => s < 999)
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map(({ r }) => r);
}
