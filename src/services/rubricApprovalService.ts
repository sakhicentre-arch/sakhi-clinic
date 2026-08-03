/**
 * rubricApprovalService.ts — Rubric Intelligence Engine (RC2 Phase 1),
 * Phase 8: Intelligence Layer service.
 *
 * Single responsibility: CRUD over the rubrics table. Mirrors
 * reminderQueueService.ts's proven state-machine shape deliberately --
 * same "AI/automation trust principle" (explicit doctor approval before
 * anything affects the clinical record), same transition() helper
 * pattern, same operationalEvents audit-logging convention.
 *
 *   pending --approve--> approved
 *      |
 *      +--reject--> rejected
 *      |
 *      +--undo (from approved/rejected)--> pending
 *
 * Manual rubrics (the doctor typing one in directly, not an AI
 * suggestion) skip the pending state entirely -- there is nothing to
 * review when the doctor is the one stating the fact. Merge/Split are
 * doctor-only actions (never AI-generated) that soft-delete their inputs
 * and create new approved rows with an audit-trail parent pointer
 * (mergedFromIds/splitFromId) rather than mutating in place.
 */

import { db, RubricEntry, RubricStatus, RubricCategory } from "./db";
import { generateId } from "../utils/generateId";
import { logOperationalEvent } from "./operationalEventLogService";
import { RubricSuggestion } from "./rubricSuggestionEngine";

const nowIso = () => new Date().toISOString();

function notDeleted(r: RubricEntry): boolean {
  return !r.deletedAt;
}

/**
 * Persists AI-generated suggestions as pending rows for a consultation.
 * Called once per consultation (from the save path, gated by
 * Consultation.rubricsGeneratedAt) -- never called per-keystroke, so this
 * is the only place rubric rows get created from AI output.
 */
export async function insertPendingRubrics(
  consultationId: string,
  patientId: string,
  suggestions: RubricSuggestion[]
): Promise<RubricEntry[]> {
  const now = nowIso();
  const entries: RubricEntry[] = suggestions.map((s) => ({
    id: generateId(),
    consultationId,
    patientId,
    category: s.category,
    text: s.text,
    matchedSentence: s.matchedSentence,
    reason: s.reason,
    confidence: s.confidence,
    evidence: s.evidence,
    priority: s.priority,
    source: "ai",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }));

  if (entries.length > 0) {
    await db.rubrics.bulkPut(entries);
    await logOperationalEvent({
      level: "info",
      type: "rubric.suggestions.generated",
      message: "Rubric suggestions generated for consultation",
      data: { consultationId, patientId, count: entries.length },
    }).catch(() => {});
  }
  return entries;
}

export async function getRubricById(id: string): Promise<RubricEntry | undefined> {
  const row = await db.rubrics.get(id);
  return row && notDeleted(row) ? row : undefined;
}

export async function listRubricsByStatus(status: RubricStatus): Promise<RubricEntry[]> {
  const rows = await db.rubrics.where("status").equals(status).filter(notDeleted).toArray();
  return rows.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function listRubricsByConsultation(consultationId: string): Promise<RubricEntry[]> {
  const rows = await db.rubrics.where("consultationId").equals(consultationId).filter(notDeleted).toArray();
  return rows.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
}

export async function listRubricsByPatient(patientId: string): Promise<RubricEntry[]> {
  const rows = await db.rubrics.where("patientId").equals(patientId).filter(notDeleted).toArray();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function transition(id: string, status: RubricStatus): Promise<RubricEntry | null> {
  const existing = await db.rubrics.get(id);
  if (!existing || existing.deletedAt) return null;
  const updated: RubricEntry = { ...existing, status, decidedAt: nowIso(), updatedAt: nowIso() };
  await db.rubrics.put(updated);
  return updated;
}

export async function approveRubric(id: string): Promise<RubricEntry | null> {
  const updated = await transition(id, "approved");
  if (updated) {
    await logOperationalEvent({
      level: "info", type: "rubric.approved", message: "Rubric approved by doctor",
      data: { rubricId: id, consultationId: updated.consultationId, patientId: updated.patientId },
    }).catch(() => {});
  }
  return updated;
}

export async function rejectRubric(id: string): Promise<RubricEntry | null> {
  const updated = await transition(id, "rejected");
  if (updated) {
    await logOperationalEvent({
      level: "info", type: "rubric.rejected", message: "Rubric rejected by doctor",
      data: { rubricId: id, consultationId: updated.consultationId, patientId: updated.patientId },
    }).catch(() => {});
  }
  return updated;
}

/** Reverts an approved/rejected rubric back to pending for re-review --
 * clears decidedAt since the decision is being undone, not amended. */
export async function undoRubricDecision(id: string): Promise<RubricEntry | null> {
  const existing = await db.rubrics.get(id);
  if (!existing || existing.deletedAt || existing.status === "pending") return null;
  const updated: RubricEntry = { ...existing, status: "pending", decidedAt: undefined, updatedAt: nowIso() };
  await db.rubrics.put(updated);
  await logOperationalEvent({
    level: "info", type: "rubric.undone", message: "Rubric decision undone",
    data: { rubricId: id, consultationId: updated.consultationId, patientId: updated.patientId },
  }).catch(() => {});
  return updated;
}

/**
 * Doctor-initiated edit before approval -- same guard as
 * reminderQueueService.updateReminderMessage: only meaningful on a
 * pending rubric, since editing an already-approved one would rewrite
 * clinical history rather than the suggestion about to be approved.
 */
export async function editRubric(id: string, updates: { text?: string; category?: RubricCategory; doctorNote?: string }): Promise<RubricEntry | null> {
  const existing = await db.rubrics.get(id);
  if (!existing || existing.deletedAt || existing.status !== "pending") return null;
  const updated: RubricEntry = { ...existing, ...updates, updatedAt: nowIso() };
  await db.rubrics.put(updated);
  await logOperationalEvent({
    level: "info", type: "rubric.edited", message: "Rubric edited before approval",
    data: { rubricId: id, consultationId: updated.consultationId, patientId: updated.patientId },
  }).catch(() => {});
  return updated;
}

export async function togglePinRubric(id: string, pinned: boolean): Promise<RubricEntry | null> {
  const existing = await db.rubrics.get(id);
  if (!existing || existing.deletedAt) return null;
  const updated: RubricEntry = { ...existing, pinned, updatedAt: nowIso() };
  await db.rubrics.put(updated);
  return updated;
}

export async function deleteRubric(id: string): Promise<void> {
  const existing = await db.rubrics.get(id);
  if (!existing) return;
  await db.rubrics.put({ ...existing, deletedAt: Date.now(), updatedAt: nowIso() });
  await logOperationalEvent({
    level: "info", type: "rubric.deleted", message: "Rubric deleted by doctor",
    data: { rubricId: id, consultationId: existing.consultationId, patientId: existing.patientId },
  }).catch(() => {});
}

/**
 * The doctor typing in a rubric that wasn't AI-suggested at all -- there
 * is no AI suggestion to review, so this goes straight to "approved"
 * rather than sitting in "pending" waiting for the doctor to approve
 * their own direct statement.
 */
export async function addManualRubric(input: {
  consultationId: string;
  patientId: string;
  category: RubricCategory;
  text: string;
  doctorNote?: string;
}): Promise<RubricEntry> {
  const now = nowIso();
  const entry: RubricEntry = {
    id: generateId(),
    consultationId: input.consultationId,
    patientId: input.patientId,
    category: input.category,
    text: input.text,
    doctorNote: input.doctorNote,
    source: "manual",
    status: "approved",
    decidedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.rubrics.put(entry);
  await logOperationalEvent({
    level: "info", type: "rubric.manual.added", message: "Manual rubric added by doctor",
    data: { rubricId: entry.id, consultationId: entry.consultationId, patientId: entry.patientId },
  }).catch(() => {});
  return entry;
}

/**
 * Combines two or more rubrics into one. Originals are soft-deleted
 * (never hard-removed, so the merge is auditable/undoable by reading
 * mergedFromIds), the new row is a doctor decision so it's created
 * already approved.
 */
export async function mergeRubrics(ids: string[], merged: { category: RubricCategory; text: string }): Promise<RubricEntry | null> {
  if (ids.length < 2) return null;
  const originals = (await Promise.all(ids.map((id) => db.rubrics.get(id)))).filter((r): r is RubricEntry => Boolean(r) && !r!.deletedAt);
  if (originals.length < 2) return null;

  const now = nowIso();
  const mergedEntry: RubricEntry = {
    id: generateId(),
    consultationId: originals[0].consultationId,
    patientId: originals[0].patientId,
    category: merged.category,
    text: merged.text,
    source: "manual",
    status: "approved",
    decidedAt: now,
    mergedFromIds: originals.map((r) => r.id),
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", db.rubrics, async () => {
    await db.rubrics.put(mergedEntry);
    for (const original of originals) {
      await db.rubrics.put({ ...original, deletedAt: Date.now(), updatedAt: now });
    }
  });

  await logOperationalEvent({
    level: "info", type: "rubric.merged", message: "Rubrics merged by doctor",
    data: { newRubricId: mergedEntry.id, mergedFromIds: mergedEntry.mergedFromIds, consultationId: mergedEntry.consultationId },
  }).catch(() => {});

  return mergedEntry;
}

/**
 * Splits one rubric into two or more. The original is soft-deleted, each
 * new row points back to it via splitFromId for audit purposes.
 */
export async function splitRubric(id: string, parts: { category: RubricCategory; text: string }[]): Promise<RubricEntry[]> {
  if (parts.length < 2) return [];
  const original = await db.rubrics.get(id);
  if (!original || original.deletedAt) return [];

  const now = nowIso();
  const newEntries: RubricEntry[] = parts.map((part) => ({
    id: generateId(),
    consultationId: original.consultationId,
    patientId: original.patientId,
    category: part.category,
    text: part.text,
    source: "manual",
    status: "approved",
    decidedAt: now,
    splitFromId: original.id,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction("rw", db.rubrics, async () => {
    for (const entry of newEntries) await db.rubrics.put(entry);
    await db.rubrics.put({ ...original, deletedAt: Date.now(), updatedAt: now });
  });

  await logOperationalEvent({
    level: "info", type: "rubric.split", message: "Rubric split by doctor",
    data: { originalRubricId: id, newRubricIds: newEntries.map((e) => e.id) },
  }).catch(() => {});

  return newEntries;
}
