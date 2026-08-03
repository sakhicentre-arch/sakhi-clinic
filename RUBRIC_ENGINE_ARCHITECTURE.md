# Rubric Intelligence Engine — Architecture

**Status:** living document, updated through each build phase. This section (Phases 1–2) is the study summary and domain model produced before any code was written.

## Terminology disambiguation (read this first)

This codebase already contains a feature colloquially called "Rubric Suggestion Automation (Module 7)" — see `src/__tests__/integration/consultationRubricApproval.test.tsx`. **That is a different feature.** It is the doctor-approval gate on top of `learningEngine.ts`'s historical remedy-pattern matching (`ConsultationPage.tsx`'s "Case Pattern Signals" panel) — it suggests *remedies* based on statistical frequency of past successful cases, and its use of the word "rubric" is informal/colloquial, not the homeopathic-repertory sense.

The **Rubric Intelligence Engine** described in this document is a distinct, new concern: it identifies and categorizes clinical *symptom statements* into structured homeopathic rubric categories (Mind, Generals, Particulars, Modalities, etc.) for doctor review — it never suggests or ranks remedies. To avoid confusion, all new code in this feature uses a `rubric` vocabulary that is namespaced away from `learningEngine.ts`'s: `rubricParserService.ts`, `rubricMatcherService.ts`, `RubricReviewPage.tsx`, etc. — never reusing the word "pattern" or "learned" that the existing remedy-suggestion feature owns.

## Prior art already in the repo

`PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` (dated 2026-07-31) already scoped this exact feature as "Module 8 — Rubric Engine," proposing a `rubricSuggestions` table shape (`id, consultationId, patientStatement, matchedRubric, rubricPath, reason, confidenceScore, source: rule|ai, doctorDecision: pending|approved|rejected, decidedAt`) and explicitly sequenced it after "Module 9 — Clinical Knowledge Base" (a licensed repertory dataset — a data-licensing decision, not an engineering one, and explicitly out of scope for this build per this phase's constraints: no Materia Medica, no repertorization). This build follows that prior design's shape closely, adapted to not depend on a licensed repertory: rather than matching patient language to a canonical repertory rubric *path* (which requires licensed reference data we don't have), this engine categorizes patient language into the 18 homeopathic rubric *categories* the doctor listed — a rule-based classification, not a repertory lookup. Repertorization (matching a categorized symptom to an actual named rubric in Kent's/Synthesis) remains a later, separate RC2 phase gated on the Module 9 licensing decision, exactly as the prior document already flagged.

## Phase 1 — Study summary

**Consultation workflow** (`ConsultationPage.tsx`, `useReducer`-based): every field write goes through one function, `patch(p) => dispatch({type:"PATCH_FORM", payload:p})`, merged by `pageReducer`. The `Consultation` record (`db.ts:85-161`) already has ~18 homeopathic fields close to a rubric taxonomy: `mind, generals, appetite, thirst, sleep, thermal, desire, aversion, sensation, timeModal, periodicity, familyHistory, allergy, urine, stool, perspiration`, plus free-text `chiefComplaint`/`caseText`. Voice dictation writes into these exact same fields via the same `patch()` path — no special-casing needed for dictated vs typed text.

**AI approval-gating convention** (the pattern this feature must replicate): `ConsultationPage.tsx`'s "Case Pattern Signals" panel (~line 1644) is the canonical example — AI computes suggestions into local state only (`SET_LEARNED` action), renders them read-only with a confidence/evidence explanation, and nothing reaches the persisted record until the doctor clicks an explicit per-item "Approve" button. Confirmed by `Consultation.learnedAt` (`db.ts:159`), an idempotency stamp preventing reprocessing — the direct precedent for this feature's own `rubricsGeneratedAt` stamp.

**Database** (`db.ts`, Dexie v54): schema evolution convention confirmed — new tables are purely additive (`this.version(N).stores({...full snapshot...})`, no `.upgrade()` transform needed when there's nothing to backfill), exactly as V51 added `reminderQueue`/`reminderHistory`. New optional fields on existing tables need no index change at all.

**Approval-queue pattern** (`reminderQueueService.ts` + `RemindersPage.tsx`): a single table with a `status` field (`pending|approved|rejected|...`) and thin transition functions (`approveReminder`, `rejectReminder`, each a 3-line wrapper around a shared `transition()` helper), reviewed via a tabs-by-status page with bulk-select checkboxes and edit-before-approve (guarded to only work on `pending` rows). This is the direct model for `rubricApprovalService.ts` + `RubricReviewPage.tsx`.

**Dashboard/reports/search/CSV/backup patterns**: all documented with exact file:line precedent in the phase-1 research; summarized in the "Reuse map" below rather than repeated here.

## Phase 2 — Domain model

The doctor's requested entity list (Rubric, Rubric Category, Rubric Source, Rubric Match, Rubric Confidence, Approved Rubric, Rejected Rubric, Rubric Group, Consultation Rubrics, Symptom Mapping, Doctor Notes) maps onto **one normalized Dexie table plus one static vocabulary module** — not eleven separate tables. This mirrors `reminderQueueService.ts`'s own proven shape (one table, a `status` field, not separate `approvedReminders`/`rejectedReminders` tables) and avoids exactly the kind of premature fragmentation the "avoid future migration problems" instruction warns against: a fixed 18-value category taxonomy is an enum (like `ConsultationOutcome`/`PaymentStatus` already are), not a doctor-editable table.

| Requested entity | Where it lives |
|---|---|
| Rubric | One row in the new `rubrics` Dexie table |
| Rubric Category | `category: RubricCategory` field — a fixed union type (18 values), enum-style like `ConsultationOutcome` |
| Rubric Source | `source: "ai" \| "manual"` field |
| Rubric Match | `matchedSentence?: string` field — the source text that triggered an AI-generated rubric |
| Rubric Confidence | `confidence?: number` field (0–1), AI-only |
| Approved Rubric | `status === "approved"` (a state, not a table — exactly how `reminderQueue` handles its statuses) |
| Rejected Rubric | `status === "rejected"` |
| Rubric Group | `mergedFromIds?: string[]` / `splitFromId?: string` — audit-trail parent pointers created by the Merge/Split doctor actions, not a join table |
| Consultation Rubrics | `consultationId` foreign key (one consultation → many rubrics; queried via `db.rubrics.where("consultationId").equals(id)`) |
| Symptom Mapping | A static, versioned vocabulary module (`rubricVocabulary.ts`) — original heuristic keyword/phrase lists per category, not a DB table (it's reference data the engine consults, not doctor-editable state) — see the Module 9 scope note above |
| Doctor Notes | `doctorNote?: string` field |

### Schema (implemented in Phase 3)

```ts
export type RubricCategory =
  | "mind" | "generals" | "particulars" | "modalities" | "sensations"
  | "locations" | "concomitants" | "etiology" | "sleep" | "foodDesires"
  | "foodAversions" | "thermals" | "perspiration" | "menses" | "pregnancy"
  | "children" | "oldAge" | "familyHistory";

export type RubricSource = "ai" | "manual";
export type RubricStatus = "pending" | "approved" | "rejected";

export interface RubricEntry {
  id: string;
  consultationId: string;
  patientId: string;          // denormalized, same convention as ReminderQueueEntry.patientId
  category: RubricCategory;
  text: string;                // the rubric phrase itself, e.g. "Desires: sweets"
  matchedSentence?: string;    // AI only: source text snippet
  reason?: string;             // AI only: human-readable why
  confidence?: number;         // AI only: 0-1
  evidence?: string;           // AI only: supporting detail
  priority?: number;           // ranking among suggestions for the same consultation
  source: RubricSource;
  status: RubricStatus;
  pinned?: boolean;
  doctorNote?: string;
  mergedFromIds?: string[];
  splitFromId?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";
}
```

Plus one new field on `Consultation` (plain optional property, no index): `rubricsGeneratedAt?: string` — idempotency stamp, direct analog of `learnedAt`, preventing re-generation of duplicate pending rubrics every time an already-processed consultation is re-saved.

## Extension points identified

- **Generation trigger**: consultation save (`handleSave` in `ConsultationPage.tsx`), not a live per-keystroke effect — avoids duplicate-parsing performance cost and matches "stored permanently" framing in the doctor's requested flow. Gated by `rubricsGeneratedAt`.
- **Inline consultation surface**: a compact, read-only "Rubric Suggestions" summary card near the existing AI Assistant region, linking to the full review page — not a second full review UI crammed into an already 3,800-line file (`CONSULTATION_IMPLEMENTATION_AUDIT.md` already flags that file's size as a modularization concern; adding more inline complexity there works against that, not with it).
- **Review UI**: new `RubricReviewPage.tsx`, structurally a near-literal mirror of `RemindersPage.tsx` (tabs-by-status, bulk-select, edit-in-place, per-status action buttons) — same `data-testid` naming convention (`rubric-select-{id}`, `rubric-edit-{id}`, etc.) for consistency with existing E2E patterns.
- **Dashboard**: new widgets follow the existing 5-layer pattern exactly (service function → state → data-fetch effect → mobile `MobileCard` → desktop panel, identical `data-testid` across both branches).
- **Search**: `CommandPalette.tsx`'s `PaletteItem` union takes a 5th `"rubric"` variant, following the existing `"consultation"` variant's shape precisely.
- **Reports**: new `rubricAnalyticsService.ts` functions, one per report shape, following `paymentService.ts`'s one-function-one-interface convention — never computed inline in a page component.
- **CSV export**: `exportRubricsCsv()` reuses `csvExportService.ts`'s existing `rowsToCsv`/`downloadCsv`/`stamp` helpers.
- **Backup/restore**: `rubrics` added to `ClinicExportBundleV2.data`, `exportClinicBundle()`, and both branches of `importClinicBundleWithOptions()` — clinical output tied to consultations, so (unlike the deliberately-excluded `reminderQueue`) it belongs in the backup bundle.

## Reuse map (what's reused vs. genuinely new)

**Reused, unmodified pattern:** `patch()`/`PATCH_FORM` state flow, AI approval-gating discipline, Dexie schema-evolution convention, `reminderQueueService.ts`'s state-machine shape, `RemindersPage.tsx`'s review-UI shape, dashboard 5-layer widget pattern, `CommandPalette.tsx`'s `PaletteItem` union, `paymentService.ts`'s report-function convention, `csvExportService.ts`'s CSV helpers, `clinicExportService.ts`'s backup allowlist mechanism, fake-indexeddb/store-seeding/localStorage-override test conventions established this session.

**Genuinely new:** one Dexie table (`rubrics`), one `Consultation` field (`rubricsGeneratedAt`), one static vocabulary module (`rubricVocabulary.ts`), and the intelligence-layer services themselves (`rubricParserService.ts`, `rubricMatcherService.ts`, `rubricConfidenceService.ts`, `rubricApprovalService.ts`, `rubricHistoryService.ts`, `rubricSearchService.ts`, `rubricExportService.ts`).
