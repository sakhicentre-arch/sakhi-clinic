# Sakhi Clinic — Production V1.0 Architecture Assessment

**Prepared as:** Chief Product/Software Architect Review
**Date:** July 31, 2026
**Status:** Assessment only. No code changed. Awaiting approval before implementation.
**Scope:** Modules 1–10 as specified — data architecture, Google Drive sync, patient import, follow-up intelligence, WhatsApp reminders, patient summary, homeopathic AI, rubric engine, clinical knowledge base, production hardening.

This document is grounded in a direct inspection of the current codebase (`src/`, `package.json`, `vite.config.ts`, Dexie schema) and the project's own prior planning artifacts (`01_PRODUCT_VISION.md` through `06_EXPERIENCE_VALIDATION`, `BETA_1.0_*`, `.brain/decisions.md`, `QUEUE_ARCHITECTURE_ANALYSIS.md`, `VOICE_ARCHITECTURE_AUDIT.md`, `CONSULTATION_IMPLEMENTATION_AUDIT.md`, and `Sakhi_Clinic_Technical_Due_Diligence_Report.docx`). Voice dictation is confirmed complete and is explicitly out of scope for redesign.

---

## 0. Executive Summary

Sakhi Clinic today is a single-page React 18 + TypeScript PWA with **zero backend**. All clinical data — patients, consultations, appointments, drafts — lives in one Dexie (IndexedDB) database, `SakhiClinicDB`, entirely inside one browser origin on one device. There is no server, no authentication, no encryption at rest, and no off-device copy of data unless the doctor manually clicks "Download Backup" and physically moves that file elsewhere. This is the direct and confirmed cause of the patient-data-loss incident (see Section 4).

The good news: the codebase is more production-adjacent than the incident suggests. Dexie schema versioning is already disciplined (v42→v49, incremental `.upgrade()` migrations), a manual export/import format (`sakhi.backup.v1`) already exists and is tested, CSV patient import is already well-built, the consultation data model already carries rich Kentian clinical fields, and the UI already reserves a slot for an "AI Assistant" card. The "AI" layer, however, is local keyword matching against a 5–15 remedy hardcoded list — not a real repertory, not an LLM, and mostly dead code that never executes. There is no cloud sync, no WhatsApp Business integration (only `wa.me` click-to-chat), and no scheduled reminders (everything is triggered by the doctor opening a page).

Independent due-diligence scoring (the project's own July 2026 report) rates this **5.0–5.5/10**: "pilot-ready for a single trusted device, not production-ready." My assessment concurs. The path to Production V1.0 does **not** require a rewrite. It requires: (1) closing the data-durability gap immediately, (2) adding a thin sync/backup layer on top of the existing Dexie source of truth, and (3) building the AI/rubric/reminder modules as new services that plug into data model extension points that already exist, rather than fighting the current architecture.

---

## 1. Architecture Review (Current State)

### 1.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| UI framework | React 18.2, TypeScript 5.0 | `strict: false`, `strictNullChecks: false` in `tsconfig.json` |
| Build | Vite 5 + `vite-plugin-pwa` 1.3 | PWA manifest, Workbox service worker, `registerType: autoUpdate` |
| State | Zustand 4.5 (5 stores) | No Redux/Jotai/React Query. React Context used once (voice session only) |
| Routing | `react-router-dom` 7.14 installed, **not used** | Navigation is manual `useState`/`uiStore` page-switching; only one file uses `useSearchParams` |
| Persistence | Dexie 4.4.2 over IndexedDB | Single DB `SakhiClinicDB`, schema v49, 8 tables |
| PDF | jsPDF + jspdf-autotable | Prescriptions/reports |
| Charts | Chart.js / react-chartjs-2 | Dashboard visuals |
| Testing | Vitest (unit) + Playwright (e2e, incl. 4 mobile viewports) | Present and reasonably organized, coverage not verified |
| Native wrapper | **None** — no Capacitor/Cordova, no `/android` or `/ios` dirs | Runs as an installable web PWA (Android "Add to Home Screen"/WebAPK), not a native-packaged app |
| Backend | **None** | 100% client-side; no server, no cloud DB, no auth provider |

### 1.2 Folder structure

`src/` is organized by **technical layer**, not by feature: `ai/`, `components/`, `data/`, `hooks/`, `pages/`, `repositories/`, `services/`, `store/`, `types/`, `utils/`. A single feature such as "patient" is scattered across `pages/PatientPage.tsx`, `services/patientService.ts`, `repositories/patientRepository.ts`, `store/usePatientStore.ts`, `hooks/usePatientSearch.ts`. This is a workable pattern at the current size but is already straining — `ConsultationPage.tsx` alone is 3,600+ lines. This matters for the roadmap: several new modules (rubric engine, reminder queue, patient summary card) will want to live as vertical slices, and I recommend a light structural convention (Section 13) rather than a big-bang refactor.

### 1.3 Data layer (detail)

`src/services/db.ts` defines the sole database:

```
Dexie DB name: "SakhiClinicDB"
Schema version: 49 (incremental history from v42)
Tables:
  patients          — id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt
  consultations     — id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt
  learning          — ++id, [remedy+symptomKey], remedy, symptomKey
  caseMemory        — ++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt
  appointments      — id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt
  drafts            — id, patientId, savedAt
  syncOutbox        — id, entityType, entityId, operationType, timestamp, syncStatus, retryCount
  operationalEvents — id, timestamp, level, type
```

Migrations are handled with Dexie's standard `.version(N).stores({...}).upgrade(tx => ...)` chain; v46 already contains a real data-backfill migration. This is a sound pattern — it should be **kept, not replaced** — but it only protects the schema *inside* one IndexedDB instance. It does nothing if that instance itself is deleted or if the app is ever served from a different origin (Section 4).

Soft-delete (`deletedAt`) and audit timestamps (`createdAt`/`updatedAt`) are already conventions across every table — a strong foundation for both backup/restore and future audit logging (Module 10).

A `syncOutbox` table already exists in the schema (v48+) with exactly the shape a future sync engine needs (`entityType`, `entityId`, `operationType`, `syncStatus`, `retryCount`) — but **no consumer reads from it today**. It only grows. This is the natural mechanism to extend for both Google Drive sync (Module 2) and WhatsApp delivery tracking (Module 5), rather than inventing two more parallel queues.

### 1.4 Backup (current, partial)

- `backupService.ts`: manual `exportBackup()` / `importBackup()`, format `sakhi.backup.v1`, browser download via `<a download>` + `Blob`. Wired into `DashboardPage.tsx` ("Download Backup" / "Restore Backup") and a diagnostics panel. This part works and is unit-tested (`backupFormat` test).
- `runAutoBackupIfDue()`: a **silent** auto-snapshot written to the Cache Storage API (`caches.open("sakhi-backups-v1")`) — same browser origin as the primary data, not a downloadable file, gated by a `localStorage` timestamp, minimum 6 hours between runs.
- `storageHealthService.ts`: tracks last-backup time/size/counts, itself stored in `localStorage` — equally origin-scoped and equally erasable.
- The only mention of Google Drive anywhere in the code is a **UI text tip** in the diagnostics panel suggesting the doctor manually upload the exported file — there is no integration.

**Net effect: every layer of "backup" that exists today — Dexie, Cache Storage auto-snapshot, and its own health metadata — lives in the same browser origin.** A single browser action (clear site data, app uninstall in some flows, or a change of origin) can take out the primary data and every safety net simultaneously.

### 1.5 Consultation, appointment/queue, and voice workflow

- **Consultation**: `Consultation` interface in `db.ts` already carries full Kentian structure — `chiefComplaint`, `caseText`, `mind`, `generals`, `appetite`, `thirst`, `sleep`, `thermal`, `desire`, `aversion`, `dream`, `physicalObservation`, `behaviour`, `sensation`, `onset`, `timeModal`, `periodicity`, `miasm`, `caseType` (acute/chronic), full history fields, and `medicines: Medicine[]` for prescriptions. There is **no rubric or repertorization field yet** — this is the clean extension point for Modules 7–8.
- **Appointment/Queue**: Zustand `queueStore` (`QueueEntry` with `status: waiting|in-progress|done|skipped`) is loosely FK'd to `appointments` via an optional `appointmentId`. The project's own `QUEUE_ARCHITECTURE_ANALYSIS.md` already flags three sync gaps here (appointment status doesn't reliably mirror queue status, no enforced 1:1 mapping, unclear status transition on consultation save) — relevant context for Module 4/6, since follow-up intelligence and the patient summary card will read from both stores.
- **Voice dictation (frozen, confirmed complete)**: pure client-side Web Speech API in `useVoiceSession.ts` + `VoiceSessionContext.tsx`. Transcripts are written directly into the same free-text `Consultation` fields as typed input — there is no separate transcript record. This is important for the AI pipeline design: **the AI pipeline's input is just consultation field text, regardless of whether it was typed or dictated.** No changes to voice are proposed or needed.

### 1.6 Existing "AI" (current, and why it doesn't meet Module 7/8 requirements yet)

There is already a full local, rule-based pipeline, wired live into `ConsultationPage.tsx` and `QuickConsultationPage.tsx`:

- `src/data/materiaMedica.json` — 5 remedies, stub-scale.
- `src/data/materiaMedica.ts` — ~15 remedies, richer hardcoded `RemedyKnowledge` records.
- `src/data/MateriaMedica.pdf` (94MB) — a real reference text, **never parsed into structured data**.
- `src/services/remedyEngine.ts`, `src/ai/prescriptionEngine.ts` (v7.0), `src/ai/differentiationEngine.ts`, `src/services/aiReasoningEngine.ts` — keyword/synonym matching with basic negation handling, no polarity/grading, no confidence calibration, no LLM call anywhere. Per the due-diligence report, most of `src/ai/*` (7 of 8 files) is dead code never reached from the live UI.
- The consultation UI already has a **reserved, designed slot** for this: `CONSULTATION_SCREEN_BLUEPRINT_V1.md` section 2.8, "AI Assistant" card — collapsed by default, "AI never replaces the doctor's judgment." This is the sanctioned integration point for Modules 7 and 8; it should be re-pointed at a real pipeline, not duplicated.

### 1.7 Prior architectural decisions already on record (`.brain/decisions.md`, binding, all still Active)

1. Dexie/IndexedDB is the offline-first persistence layer — **keep**.
2. Modular architecture for maintainability and future AI integration — **keep**.
3. Core clinic workflow reliability precedes AI features — **keep as sequencing principle**.
4. All clinic data goes through Dexie with schema versioning, not localStorage — **keep; extend the same discipline to every new table**.

`.brain/rejections.md` has no entries — nothing has been formally rejected. The Beta 1.0 Scope Lock deferred patient-import tooling and "advanced AI automation beyond reviewable assistance" to a *future release* — this document **is** that future release; there is no conflict, only a deliberate scope expansion.

---

## 2. Gap Analysis

| Module | Requirement | Current State | Gap |
|---|---|---|---|
| 1. Data architecture | Zero data loss, backup, restore, rollback, export/import, version history | Dexie w/ versioned schema; manual export/import works; auto-backup is silent & same-origin only | No off-device copy, no rollback/version history, no integrity verification, no protection against origin change |
| 2. Google Drive sync | Google login, auto folder, encrypted backup, incremental sync, conflict resolution | Nothing built; one UI text tip | Full module net-new |
| 3. Patient import | Excel + CSV, duplicate detection, merge, validation, preview, rollback | CSV import is solid (fuzzy headers, 3 conflict modes, per-row errors); Excel not implemented; no explicit rollback-on-failure transaction | Excel parser, rollback wrapper, formal preview UI |
| 4. Follow-up intelligence | Morning dashboard: overdue, today, next 7 days, missing follow-up, chronic, reminder state | `nextFollowUpDate` field exists on `patients`; no dashboard aggregation, no chronic flag, no reminder-state tracking | Full module net-new, but built on existing fields |
| 5. WhatsApp reminders | Queue, approval, send, history, delivery status, retry, scheduling | `whatsappService.ts` exists but is `wa.me` click-to-chat only — manual, single-send, no delivery confirmation, India-only formatting | Needs a real send/track pipeline; delivery status requires a Business API provider decision (Section 14) |
| 6. Patient summary card | Last visit, diagnosis, meds, follow-up due, reminder status, timeline, alerts | Data exists across `patients`/`consultations`/`caseMemory`; `PatientHistoryTimeline.tsx` exists (duplicated in two folders — needs cleanup) | Aggregation view + component; mostly assembly of existing data |
| 7. Homeopathic AI pipeline | Staged: symptoms → mentals → physicals → modalities → particulars → rubrics → doctor review → repertorization → materia medica → remedies | Single-shot keyword match straight to remedy suggestion; no staged pipeline; no confidence scoring surfaced; most of it is dead code | Needs to be rebuilt as a staged pipeline; can reuse `differentiationEngine.ts` logic as one stage |
| 8. Rubric engine | Patient statement → rubric → reason → confidence → doctor approval | No rubric concept exists in code or data model at all | Full module net-new; new Dexie table(s) required |
| 9. Clinical knowledge base | Kent/Synthesis repertory, Materia Medica, synonyms, patient-language mapping | 5–15 hardcoded remedies; a 94MB unparsed PDF; no rubric data, no licensing-cleared repertory | Needs a licensing-legal sourcing decision before any data engineering (Section 14) |
| 10. Production hardening | Auth, audit log, encryption, security, performance, migration, backup verification, testing, monitoring, recovery | No auth, no encryption, no audit log; migrations exist but restore path is untested; no error boundary; unindexed full-table scans on lists | Broad but well-scoped hardening backlog |

---

## 3. Production Readiness Assessment

Scoring on a 10-point scale, consistent with the project's own July 2026 due-diligence baseline, updated with the two-week-later architectural review in this document:

| Dimension | Score | Rationale |
|---|---|---|
| Data durability | **2/10** | Single origin, single device, no automatic off-device copy. Root cause of the incident that triggered this review. |
| Security (auth/encryption) | **2/10** | No login, no encryption at rest, a fake `Math.random()`-based "hash" is printed on prescriptions as if it were a real signature — must be removed before any doctor-facing production release. |
| Clinical workflow reliability | **6.5/10** | Core consultation/queue/appointment flow is functional and already has good data modeling; known gaps are the queue↔appointment sync issues and an autosave bug that resets on every keystroke instead of a wall-clock cadence. |
| Offline-first | **7/10** | Genuinely offline-capable by design (Dexie + Workbox app-shell caching); undermined only by the backup gap above, not by the offline mechanism itself. |
| AI trustworthiness | **4/10** | Structurally aligned with the project's own "AI never replaces the doctor" principle (good governance instinct), but the underlying matching is too shallow to be clinically useful yet, and most of it doesn't even run. |
| Maintainability | **5.5/10** | Reasonable module boundaries but a layer-based (not feature-based) structure, one 3,600-line page component, dead AI code, and a documented duplicate component file. |
| Testing / QA | **5.5/10** | Real unit + e2e infrastructure exists (rare at this stage) but coverage is uneven and the destructive restore path is explicitly untested. |
| Scalability (patient volume) | **4/10** | Unindexed full-table scans for patient/consultation lists will degrade as the practice's history grows; fine today, a real constraint within 1–2 years of daily use. |
| **Overall** | **~4.5/10 for production; 6/10 for single-doctor pilot** | Consistent with the project's own prior assessment. The architecture is sound enough to extend — the score reflects missing safety nets, not a bad foundation. |

**Verdict: extend, do not rebuild.** The Dexie schema, the Zustand store pattern, the repository/service layering, and the consultation data model are all reasonable production building blocks. What's missing is almost entirely *additive*: a sync/backup layer, real staged AI, a rubric data model, a reminder engine, and hardening — not a different foundation.

---

## 4. Root Cause: Why Patient Data Was Lost (Module 1, answered directly)

Working through the questions asked:

- **Where is patient data stored?** IndexedDB, via Dexie, database name `SakhiClinicDB`, entirely inside one browser origin, on one device. Confirmed in `src/services/db.ts`.
- **Is Dexie used?** Yes — Dexie 4.4.2, the sole persistence layer for every clinical table. This is a legitimate, well-supported choice; the issue is not Dexie, it's the absence of anything *outside* Dexie.
- **How are schema versions handled?** Disciplined — Dexie's native `.version(N).stores().upgrade()` chain, v42 through v49, with real data-migrating upgrades where needed (v46). This mechanism is not the source of the incident.
- **What are the current risks?**
  1. **Origin dependence.** IndexedDB, localStorage, and Cache Storage are all scoped to the exact browser origin (protocol + host + port) the PWA is served from. If the app was ever accessed from more than one origin — a local dev server, a Vite preview URL, different deployment URLs across iterations, or `http://` vs `https://` — **each origin has its own, completely separate, empty database**, even though the DB name (`SakhiClinicDB`) is identical in code. This is almost certainly what happened: **"installed another version" likely means served from a different URL/build than the original**, which to the browser is an entirely different, brand-new empty database — not an upgrade of the old one.
  2. **Browser/device-level clearing.** "Clear site data," a factory reset, storage-pressure eviction on a low-storage Android device, or (for the PWA install path specifically) certain Android "uninstall app" flows can clear the origin's storage. Since this app has no native wrapper (no Capacitor), it's installed as a WebAPK/"Add to Home Screen" shortcut around Chrome — its data lifecycle is governed by Chrome's storage rules for that origin, which the user may not realize is shared with (or separate from) other tabs/installs.
  3. **No off-device copy existed.** Even where the auto-backup ran, it wrote to Cache Storage in the *same* origin — so any event that wipes the origin wipes the backup too. The only thing that would have survived is a manually downloaded `sakhi.backup.v1` file the doctor moved outside the browser (email, USB, cloud drive) — and there's no evidence that step was ever taken or prompted for.
- **Can browser updates lose data?** Not typically by themselves — browser IndexedDB is durable across normal browser updates. The realistic mechanisms are origin change, explicit data clearing, or storage eviction, not browser version upgrades per se.
- **Can reinstall create a new empty database?** Yes, definitively, if the reinstall changes the origin (new deployment URL) or if the browser clears the underlying storage as part of "uninstall." Dexie/IndexedDB has no built-in concept of surviving that — it is designed to be per-origin storage, not a portable user profile.
- **Can preview and production use different databases?** **Yes — this is very likely the actual mechanism here.** Any two different hostnames, ports, or protocols are, to IndexedDB, two totally unrelated databases, both happily named `SakhiClinicDB` in code but physically disjoint on disk. This is one of the most common real-world causes of "my data disappeared" in web-app development workflows, and nothing in the current architecture guards against it.
- **What migration mechanisms exist?** Only within a single origin's Dexie instance (schema-version migrations). There is **no mechanism at all** for migrating or merging data across origins/devices — that gap is exactly what Module 1 and Module 2 need to close.

**Conclusion:** this was very likely an origin-identity problem, not a Dexie bug or a browser defect. The fix is two-layered: (a) lock Production V1.0 to one canonical, permanent, versioned URL so "the app" always means one origin going forward, and (b) make sure data is never solely dependent on any one origin/device surviving, via automatic off-device backup (Module 1) and Drive sync (Module 2).

---

## 5. Recommended Architecture (Target State)

Guiding principles, in priority order:

1. **Local Dexie remains the single source of truth for live reads/writes.** Nothing about the offline-first, instant-save UX should change — this is a strength, not a weakness, and DECISION-001/004 already lock this in.
2. **Every new "external" capability (Drive backup, WhatsApp send, future server sync) is built as a consumer of the existing `syncOutbox` pattern**, not as three separate bespoke queues. One event-sourced outbox, multiple consumers, each with its own `syncStatus`/`retryCount` semantics already scaffolded in the schema.
3. **Backup is structurally guaranteed, not doctor-remembered.** Automatic, versioned, off-device (Drive), with the existing manual export retained as an emergency/portable fallback — never the only line of defense.
4. **AI is a pipeline of small, inspectable, doctor-reviewable stages — never a single opaque call.** This matches the project's own existing design principle (AI Trust Architecture in `03_INFORMATION_ARCHITECTURE.md`, the Risk Register's Critical rating on AI hallucination, and the Blueprint's existing "AI Assistant" card) and is now enforced structurally by storing each stage's output (extracted symptoms, candidate rubrics, confidence, doctor decision) as its own auditable record, not a transient UI state.
5. **One canonical production origin, permanently.** Before any of the above matters, the app must be deployed to one fixed, versioned URL that never changes across releases — otherwise every future improvement to backup/sync still can't protect against the exact failure mode diagnosed in Section 4.
6. **Extend, version, and migrate — never replace — the existing Dexie schema.** Every new module below is expressed as new tables/fields under the same `SakhiClinicDB`, versioned the same disciplined way v42–v49 already were.

---

## 6. Module-by-Module Implementation Plan

### Module 1 — Production Data Architecture
**Design:** (a) Fix canonical origin/deployment first — this is a prerequisite for everything else, effort-free but process-critical. (b) Add an integrity-checked, versioned, automatic backup: on each successful backup, write a manifest (timestamp, record counts per table, checksum) into a new `backupHistory` Dexie table, and push the same payload to Drive (Module 2) as the off-device copy — Cache Storage auto-snapshot is downgraded to a same-device fast-recovery cache, not the durability guarantee. (c) Restore gets a two-step confirm + dry-run diff ("this will replace X patients, Y consultations — continue?") before the existing destructive overwrite runs, and the destructive path finally gets an automated test against a live database, closing the due-diligence report's top-rated gap. (d) Rollback = restore-from-a-prior-`backupHistory`-entry, using the version history already being recorded.
**Builds on:** `backupService.ts`, `storageHealthService.ts`, existing `sakhi.backup.v1` format (extend, don't replace).
**New tables:** `backupHistory` (id, createdAt, recordCounts, checksum, location: local|drive, sizeBytes).
**Effort:** Medium. Highest priority — this is the doctor's stated #1 concern.

### Module 2 — Google Login & Drive Sync
**Design:** Google OAuth (Identity Services) for login, scoped only to Drive's app-data or a dedicated visible folder (`Sakhi Clinic Backups/`) — not full Drive access. On login, create the folder once (idempotent check by name+metadata). Every `backupHistory` entry from Module 1 is pushed as a Drive file version (Drive natively supports file version history, so "version history" and "rollback" partially come for free from the Drive API rather than needing custom infrastructure). Local Dexie stays authoritative; Drive is a mirror, so conflict resolution is simplified to "most recent local write wins, prior Drive versions remain recoverable via Drive's own version history" rather than needing true multi-master merge — appropriate for a single-doctor, mostly-single-device product today. Multi-device restore = sign in with the same Google account on a new device, pull latest backup from the Drive folder, run the Module 1 restore flow.
**New dependency:** Google Identity Services (OAuth) + Drive API v3 client (`googleapis` browser-safe subset or direct REST via `fetch`, avoiding the heavy Node `googleapis` package).
**Data safety note:** backups should be encrypted client-side (Module 10) before upload, so Drive only ever stores ciphertext — key management decision needed (Section 14).
**Effort:** Medium-High. Second priority, directly closes the root cause in Section 4.

### Module 3 — Patient Import
**Design:** Extend the existing, already-solid CSV pipeline (`patientImportService.ts`) rather than building a parallel Excel path: add an Excel parser (Section 10 dependency) that normalizes into the same intermediate row format the CSV path already uses, so duplicate detection, fuzzy header matching, and the 3 conflict modes are reused unchanged. Wrap the actual write phase in a single Dexie transaction (`db.transaction('rw', ...)`) so a mid-import failure rolls back atomically — this doesn't exist today and is an explicit Risk Register item ("Migration failure"). Preview step already conceptually exists in the CSV flow; extend it to show a full diff (new / duplicate / conflicting rows) before commit.
**Effort:** Low-Medium — mostly extending an already-working pattern.

### Module 4 — Follow-Up Intelligence Dashboard
**Design:** A read-model aggregation service (no new source-of-truth tables needed) that queries `patients.nextFollowUpDate` and recent `consultations` to bucket: overdue, today, next 7 days, no-follow-up-set, and chronic (`caseType === "chronic"` already exists on `Consultation`). "Last reminder" and "reminder pending" read from the Module 5 reminder tables. Rendered as the doctor's landing view — already partially anticipated by the existing `TodayPage.tsx`, which this module extends rather than replaces.
**Effort:** Low-Medium, high visible value — recommend doing this early since it's cheap and directly requested by the doctor.

### Module 5 — WhatsApp Reminder Engine
**Design:** Formalize `whatsappService.ts` from ad hoc `wa.me` links into a queue: a new `reminderQueue` table holds pending reminders generated from Module 4's follow-up buckets, each requiring explicit doctor approval before send (non-negotiable per the project's own AI/automation trust principle — applies equally to any outbound patient communication). Approved items move to `reminderHistory` with delivery status. **Delivery status and retry require a real WhatsApp Business API provider** (e.g., Meta's Cloud API or a BSP like Twilio/Gupshup) — the current click-to-chat approach cannot report delivery status at all, so this is a product/cost decision, not just an engineering one (Section 14). Until that's decided, ship the approval-queue + history UI against the existing click-to-chat send, with delivery status manually marked by the doctor as an interim state.
**Effort:** Medium for the queue/approval/history layer; Medium-High if/when a real Business API is integrated.

### Module 6 — Patient Summary Card
**Design:** Pure aggregation/view-layer work — last visit and diagnosis from the latest `consultations` row per patient, current medicines from that row's `medicines[]`, follow-up due from Module 4's bucket for that patient, reminder status from Module 5, timeline from existing `PatientHistoryTimeline.tsx` (deduplicate the two copies of this component first — Section 12), alerts surfaced from Risk Register-style rules (e.g., overdue chronic follow-up, missed reminder). No new persisted data required beyond what Modules 1–5 already produce.
**Effort:** Low — sequence this after Modules 4 and 5 since it consumes their output.

### Module 7 — Homeopathic AI Pipeline
**Design:** Replace the current single-shot keyword match with the requested staged pipeline, where **each stage writes a persisted, inspectable record** rather than a transient in-memory result:
`Transcript (existing field text) → Symptom Extraction → {General, Mental, Physical} Symptoms → Modalities → Particular Symptoms → Rubric Suggestions (Module 8) → Doctor Review → Repertorization → Materia Medica Comparison → Suggested Remedies (doctor-facing, non-final)`.
Symptom extraction can start as an improved rule/NLP layer (reusing/refactoring the salvageable parts of `differentiationEngine.ts`); whether later stages should call an LLM API is an open, consequential decision (privacy of patient text leaving the device, cost, offline-availability trade-off) — flagged for the doctor/product owner in Section 14, not decided unilaterally here. Every stage output is doctor-reviewable and reversible, consistent with DECISION-003 and the Risk Register's Critical rating on AI hallucination. Slots into the already-designed "AI Assistant" card from `CONSULTATION_SCREEN_BLUEPRINT_V1.md` §2.8.
**Effort:** High. Sequence after the Knowledge Base (Module 9) is at least partially populated — an empty repertory makes this pipeline vacuous.

### Module 8 — Rubric Engine
**Design:** New `rubricSuggestions` table: `{id, consultationId, patientStatement, matchedRubric, rubricPath (e.g. "Mind > Forsaken Feeling"), reason, confidenceScore, source: rule|ai, doctorDecision: pending|approved|rejected, decidedAt}`. Every suggestion is generated *for* a specific patient statement (traceable, auditable) and requires explicit doctor approval before it affects repertorization weighting — this record *is* the audit trail Module 10 needs for AI actions. Matching starts as a synonym/pattern-mapping layer over the knowledge base (Module 9); can later be strengthened with embeddings/LLM-assisted matching once the "AI vendor" decision (Section 14) is made.
**Effort:** Medium-High, tightly coupled to Module 9's data quality.

### Module 9 — Clinical Knowledge Base
**Design:** This module is fundamentally a **data licensing and sourcing decision**, not a coding one — see Section 14. Legally clean options, in order of preference: (a) license a structured repertory/materia medica dataset commercially (several homeopathic software vendors and repertory publishers offer licensable digital datasets); (b) use public-domain sources only (Kent's *Repertory of the Homeopathic Materia Medica*, 1897, and Hahnemann's *Organon* and *Materia Medica Pura* are public domain in most jurisdictions given their age — Synthesis and modern repertories are **not** public domain and must not be scraped or reproduced); (c) build the patient-language → rubric synonym layer as original work, informed by (but not copying) licensed structure. The unused 94MB `MateriaMedica.pdf` already in the repo must be legal-source-verified before any parsing effort is spent on it. Data model: `rubrics` (hierarchical path, synonyms[]), `remedies` (expand the existing ~15-entry `materiaMedica.ts` schema), `patientLanguageMap` (phrase → rubric candidates, confidence, for Module 8 to consume).
**Effort:** Variable — bounded by licensing negotiation more than engineering, flag for the doctor early since it gates Modules 7–8's ceiling of usefulness.

### Module 10 — Production Hardening
**Design, by area:**
- **Authentication:** minimum viable is the same Google login from Module 2, reused as app-level auth (single-doctor product — no RBAC complexity needed yet, despite what the aspirational `03_INFORMATION_ARCHITECTURE.md` describes).
- **Audit logs:** the `operationalEvents` table already exists in schema — extend it to log every AI-approval decision (Module 8), every reminder send (Module 5), and every restore/rollback (Module 1), which also satisfies clinical-safety-gate requirements already named in the Risk Register.
- **Encryption:** Web Crypto API (AES-GCM) for data-at-rest on sensitive fields and for Drive backup payloads (Module 2) — client-side, so the encryption key never leaves the doctor's control (key management decision, Section 14).
- **Performance:** add pagination/virtualization to patient and consultation list views (currently full-table scans — confirmed defect, will degrade with real usage volume) and add compound Dexie indexes where list queries filter/sort.
- **Migration & backup verification:** automated tests for every Dexie `.upgrade()` and specifically the destructive restore path (currently untested — the report's top production blocker).
- **Testing strategy:** extend existing Vitest/Playwright coverage to the new modules; add a CI gate requiring the restore-path test to pass before deploy.
- **Monitoring:** lightweight client-side error/crash logging (e.g., writing to `operationalEvents` plus an optional remote sink) — currently there's no React error boundary anywhere, so any render error blanks the whole app; add one as a near-term fix regardless of the broader roadmap.
- **Recovery:** formalize the "what does the doctor do if the app won't open" runbook, backed by the Module 1/2 backup chain.
**Effort:** Spread across every phase, not a single phase — see roadmap.

---

## 7. Database Design (Target Schema, v50+)

Extend `SakhiClinicDB` — do not create a second database. Proposed additive tables, each versioned in with its own `.upgrade()`:

| Table | Purpose | Key fields |
|---|---|---|
| `backupHistory` | Module 1 | id, createdAt, recordCounts, checksum, location, sizeBytes |
| `driveSync` | Module 2 | id, driveFileId, localBackupId, syncedAt, status |
| `importBatches` | Module 3 | id, source (csv/xlsx), startedAt, status, rowCounts |
| `importRows` | Module 3 | id, batchId, rawRow, resolution (new/duplicate/conflict), resolvedAs |
| `reminderQueue` | Module 5 | id, patientId, type, dueAt, status: pending\|approved\|rejected |
| `reminderHistory` | Module 5 | id, patientId, sentAt, channel, deliveryStatus, retryCount |
| `rubricSuggestions` | Module 8 | id, consultationId, patientStatement, rubricPath, reason, confidenceScore, doctorDecision |
| `symptomExtractions` | Module 7 | id, consultationId, stage, extractedData, createdAt |
| `rubrics` | Module 9 | id, path, synonyms[], sourceLicense |
| `remedies` (extend existing) | Module 9 | id, name, keySymptoms, modalities, generals, sourceLicense |
| `auditLog` (or extend `operationalEvents`) | Module 10 | id, actorType (doctor/ai/system), action, entityRef, timestamp |

`syncOutbox` (existing) is extended in *meaning*, not shape: `entityType` gains new values (`backup`, `reminder`) so Modules 2 and 5 both drain the same outbox instead of inventing new queues.

---

## 8. Migration Strategy

1. **Canonical origin lock first.** Before any schema work, fix the deployment so Production V1.0 always lives at one permanent URL. Retroactively, offer a one-time "recover from another origin" flow isn't possible browser-side — so the near-term mitigation is entirely forward-looking (this is why Module 2's off-device backup is urgent).
2. **All new tables ship as pure additive Dexie versions** (`db.version(50).stores({...})`), following the exact pattern already proven in v42–v49 — no breaking changes to existing tables' primary keys or index shapes.
3. **Every migration gets an automated test** (gap identified in Section 3) — run the upgrade against a seeded v49 fixture DB and assert both schema and data integrity post-upgrade.
4. **Backward-compatible reads during rollout:** since this is a single-device-per-doctor product today, "rollout" mostly means "next time the doctor opens the app" — but the same discipline (never assume the upgrade ran instantly/atomically across all data) should hold once Module 2 introduces multi-device use.
5. **Backup-before-migrate:** trigger a Module 1 backup automatically immediately before running any schema version bump that includes a real `.upgrade()` data transform (not needed for pure additive no-op versions).

---

## 9. Risk Analysis

| Risk | Severity | Mitigation |
|---|---|---|
| Recurrence of origin-based data loss | Critical | Canonical origin lock (Section 8.1) + Module 2 off-device backup |
| AI/rubric hallucination presented as fact | Critical | Every AI/rubric output stored with source+confidence, requires explicit doctor approval before affecting clinical record (already a Risk Register Critical item, now structurally enforced via Modules 7/8 design) |
| Repertory/Materia Medica IP infringement | High | Legal sourcing decision before data engineering (Module 9, Section 14) |
| WhatsApp delivery claims without a real Business API | Medium | Ship approval+history UI now; gate "delivery status" claims until a real provider is integrated |
| Restore path failure in production | Critical (per due diligence) | Automated test against a live DB before any Module 1 rollout |
| Encryption key loss (Drive backups unreadable) | High | Explicit key-management decision required before Module 2/10 encryption ships (Section 14) |
| Performance degradation at scale (unindexed scans) | Medium, growing | Pagination + indexing in Module 10, do not defer indefinitely |
| Scope creep across 10 modules simultaneously | High (process risk) | Strict phased roadmap (Section 11), one module's data model ships before the next module that depends on it |
| ConsultationPage.tsx monolith complicates AI pipeline integration | Medium | Light modularization of the AI Assistant card region before Module 7 lands (not a full component rewrite) |

---

## 10. Dependencies (New Packages by Module)

| Module | New dependency | Notes |
|---|---|---|
| 2 | Google Identity Services (script, no npm pkg) + Drive REST via `fetch` | Avoid the full Node `googleapis` package — too heavy for a browser bundle |
| 3 | `xlsx` (SheetJS) or `exceljs` | Excel parsing; CSV path already has no dependency gap |
| 5 | WhatsApp Business API SDK / provider SDK (Twilio, Gupshup, or Meta Cloud API direct) | Decision-gated, Section 14 |
| 7/8 | Optional: `@anthropic-ai/sdk` (or equivalent) **only if** the LLM-assisted path is chosen | Decision-gated, Section 14; local-only path needs no new SDK |
| 10 | None new — Web Crypto API is native to the browser | Encryption needs no dependency |
| 10 | Optional: a lightweight client error-reporting lib, or a hand-rolled sink into `operationalEvents` | Monitoring |

No dependency changes are needed for Modules 1, 4, or 6 — they're built entirely on existing libraries.

---

## 11. Development Roadmap, Priority Order & Phases

**Priority is driven by the doctor's stated #1 concern (data loss) and by dependency ordering between modules** (e.g., Module 6 consumes Modules 4/5; Module 7 depends on Module 9 to be non-trivial).

**Phase 0 — Stop the Bleeding (days, not weeks)**
Canonical origin lock; verify current manual export/import still works end-to-end; add the missing automated test for the destructive restore path; remove the fake "Clinical Authentication" hash defect; add a React error boundary. This phase alone materially reduces the risk of another data-loss incident before anything else ships.

**Phase 1 — Module 1: Production Data Architecture**
Automatic versioned backup, integrity checksums, restore dry-run/confirm, rollback via `backupHistory`. This is the direct, structural fix for the reported incident.

**Phase 2 — Module 2: Google Login & Drive Sync**
Off-device copy of Module 1's backups. Closes the "single device, single origin" risk completely.

**Phase 3 — Module 3: Patient Import (Excel) + Module 4: Follow-Up Intelligence Dashboard**
Run in parallel — they don't depend on each other. Both are high doctor-visible value, moderate effort, and build on already-solid existing code (CSV import, `nextFollowUpDate`).

**Phase 4 — Module 6: Patient Summary Card**
Now that Module 4 exists, the summary card's "follow-up due" and "alerts" sections have real data to show. (Module 5's reminder-status field can initially show "not yet available" and be filled in by Phase 5.)

**Phase 5 — Module 5: WhatsApp Reminder Engine**
Approval queue + history UI against the existing click-to-chat mechanism; real Business API integration is a follow-on sub-phase once the provider decision (Section 14) is made.

**Phase 6 — Module 9: Clinical Knowledge Base (data sourcing track, can start in parallel with Phase 3–5 since it's largely a licensing/data-engineering track, not app engineering)**

**Phase 7 — Module 7: Homeopathic AI Pipeline + Module 8: Rubric Engine**
The largest, highest-uncertainty phase — deliberately sequenced last among the feature modules because it depends on Module 9's data being in reasonable shape, and because DECISION-003 ("core workflow before AI") is an explicit, still-active architectural decision.

**Phase 8 — Module 10: Production Hardening, continuous**
Auth, encryption, performance, monitoring, and audit logging are not a single phase at the end — items land incrementally alongside every phase above (e.g., the audit log grows as soon as Module 8 produces approvable AI decisions; encryption should land no later than Phase 2 since Drive backups need it immediately).

---

## 12. Potential Problems (Execution-Level, Specific)

- `tsconfig.json` has `strict: false` and `strictNullChecks: false` — this will make the new data-model-heavy modules (rubric confidence scores, reminder statuses, sync states) more bug-prone than necessary. Recommend enabling `strictNullChecks` at minimum before Module 1 lands, even if full `strict` mode is a longer-term goal.
- `ConsultationPage.tsx` at 3,600+ lines is already flagged by the project's own audit as needing modularization "before further feature layering" — Module 7's AI Assistant card integration is exactly that further layering, so a light extraction of the AI Assistant region into its own component is worth doing just ahead of Module 7, not as a separate big-bang refactor.
- `PatientHistoryTimeline.tsx` exists duplicated in two folders — resolve before Module 6 builds on it, to avoid two divergent copies.
- The documented autosave bug (resets on every keystroke instead of a wall-clock cadence) should be fixed in Phase 0 — it directly undermines the "zero data loss" goal at the field level, not just the database level.
- `react-router-dom` v7 is installed with `@types/react-router-dom` for v5 and is barely used — this is latent confusion, not an active bug, but worth resolving (either commit to router-based navigation or remove the mismatched types) before adding more pages (patient import wizard, reminder queue, dashboard) that will want clean routes/deep-links.
- The `syncOutbox` table already exists unconsumed — there is a temptation to leave it and build new ad hoc queues per module; resist this, since consolidating onto one outbox pattern is materially simpler to reason about and test than three.
- Legal risk on Module 9 is real, not hypothetical — Synthesis and most modern repertories are actively licensed products; scraping or reproducing them would create real legal exposure for a production clinical product.

---

## 13. Suggested Improvements to Existing Architecture (Independent Hygiene)

- Adopt a light feature-folder convention **going forward** for new modules only (e.g., `src/features/reminders/{service,store,components}.ts`) rather than retrofitting the whole existing tree — lower risk, and lets the new higher-complexity modules (rubric engine, reminder engine) stay cohesive.
- Formalize the outbox-consumer pattern as a small internal framework (`registerOutboxConsumer(entityType, handler)`) so Drive sync, WhatsApp send, and any future server sync are three thin handlers over one mechanism, not three mechanisms.
- Add pagination/virtualized lists for patients/consultations now, ahead of the volume growth that Modules 3/4 (import + dashboard) will accelerate.
- Add a top-level React error boundary — currently a single render error can blank the whole app, which is unacceptable for a clinical tool used mid-consultation.
- Clean up dead `src/ai/*` files that never execute, once Module 7 supersedes them, so the AI pipeline has one clear implementation, not four historical layers.

---

## 14. Open Decisions Requiring Doctor / Product Owner Input

These cannot be resolved by engineering alone and should be decided before the relevant module's implementation phase begins:

1. **LLM vendor decision for Modules 7/8** — continue purely local/rule-based (fully private, fully offline, weaker clinical reasoning) vs. call an LLM API (stronger reasoning, but patient symptom text would leave the device — a real privacy/consent question already flagged as required in the project's own Privacy & Consent planning). This is the single highest-leverage decision in the whole roadmap.
2. **Google Workspace account** to use for Drive integration (personal vs. a dedicated clinic account) — affects storage quota, account recovery, and whether other family/staff members could accidentally access it.
3. **WhatsApp provider** for Module 5 — Meta's official Cloud API vs. a Business Solution Provider (Twilio, Gupshup, etc.) — trade-off is setup complexity and per-message cost vs. speed to real delivery-status tracking.
4. **Encryption key management** for Module 10/2 — a passphrase the doctor sets and remembers (simple, but unrecoverable if forgotten) vs. a recovery-key-escrow approach (safer against lockout, more engineering).
5. **Legal source for Module 9's repertory/materia medica data** — commercial license, public-domain-only (Kent 1897), or original synonym-mapping work layered on licensed structure.

---

*End of assessment. No implementation has begun. Recommend approving Phase 0 and Phase 1 (Sections 11) first, given they directly address the reported data-loss incident, before reviewing Phases 2 onward.*
