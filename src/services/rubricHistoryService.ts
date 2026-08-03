/**
 * rubricHistoryService.ts — Rubric Intelligence Engine (RC2 Phase 1),
 * Phase 8: Intelligence Layer service.
 *
 * Read-only queries for audit/timeline display. Single responsibility:
 * answer "what happened to this rubric / recently" -- never mutates
 * anything (that's rubricApprovalService.ts's job).
 */

import { db, RubricEntry } from "./db";

export async function getRecentlyApprovedRubrics(limit = 10): Promise<RubricEntry[]> {
  const rows = await db.rubrics
    .where("status")
    .equals("approved")
    .filter((r) => !r.deletedAt)
    .toArray();
  return rows
    .sort((a, b) => (b.decidedAt || b.updatedAt).localeCompare(a.decidedAt || a.updatedAt))
    .slice(0, limit);
}

export interface RubricAuditTrail {
  current: RubricEntry;
  /** Rubrics this one was created by merging -- soft-deleted, so fetched
   * directly by id rather than through the normal non-deleted list query. */
  mergedFrom: RubricEntry[];
  /** The rubric this one was created by splitting, if any. */
  splitFrom: RubricEntry | null;
}

/** Reconstructs the merge/split lineage for one rubric, including
 * soft-deleted ancestors -- an approved rubric that resulted from a
 * merge or split should still be traceable back to what it came from,
 * which is the entire point of keeping mergedFromIds/splitFromId instead
 * of hard-deleting on merge/split. */
export async function getRubricAuditTrail(id: string): Promise<RubricAuditTrail | null> {
  const current = await db.rubrics.get(id);
  if (!current) return null;

  const mergedFrom = current.mergedFromIds
    ? (await Promise.all(current.mergedFromIds.map((mid) => db.rubrics.get(mid)))).filter((r): r is RubricEntry => Boolean(r))
    : [];
  const splitFrom = current.splitFromId ? (await db.rubrics.get(current.splitFromId)) || null : null;

  return { current, mergedFrom, splitFrom };
}
