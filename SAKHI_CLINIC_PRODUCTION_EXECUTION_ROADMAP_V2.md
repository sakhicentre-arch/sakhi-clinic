# SAKHI CLINIC
# PRODUCTION EXECUTION ROADMAP
## Version 2.0

**Prepared as:** Chief Product Officer / Chief Technology Officer / Clinical Workflow Architect / Principal Software Architect / Enterprise Delivery Manager / Healthcare Product Strategist review
**Date:** 2026-08-01
**Status:** Planning only. No code changed, no repository modification, no Module B implementation begun. This document is the execution plan taking Sakhi Clinic from "Engineering Complete" to "Daily Clinical Production Use." It grounds every recommendation in the project's own existing artifacts (`PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md`, `MODULE_A_CERTIFICATION_REPORT.md`, `BETA_1.0_RISK_REGISTER.md`, `01_PRODUCT_VISION.md`, `DOCTOR_OPERATIONAL_GUIDE.md`) rather than re-deriving strategy from nothing.

---

## 0. Status Calibration

Before planning forward, one correction to the stated project status is owed, in the same spirit as Module A's own evidence discipline (PROVEN / INFERRED / UNTESTED / UNSUPPORTED).

**"Voice engine validated by the doctor"** — this roadmap treats that as the current product-status claim as given. However, the most recent artifact in the repository on this exact question, `docs/RVC-2_ANDROID_VALIDATION_PROTOCOL.md`, is a **blank, unfilled test protocol** (every device field, every phrase result, every pass/fail column is an empty bracket). The Module A certification pass separately flagged "a false RVC-2 voice-validation sign-off claim in the Implementation Contracts document" as needing correction. Neither of those findings proves the doctor has *not* validated voice dictation informally — only that there is no completed, evidenced record of it in this repository as of this writing. **Recommendation: before Part 2's acceptance plan is run, either (a) locate and attach the actual completed RVC-2 protocol if it exists elsewhere, or (b) run it fresh — it is short, already written, and directly closes this gap.** This is a paperwork gap, not a re-litigation of Module A, and it is called out once, here, so it isn't silently carried forward as an unverified claim into a production sign-off.

Everything else in "Current Project Status" (Product Vision, Production Architecture, Technical Due Diligence, CTO Architecture Review, Production Implementation Contracts, Module A implementation + independent audit + certification) is corroborated by artifacts already in the repository and is accepted as the starting point for this roadmap.

---

# PART 1 — PRODUCTION RELEASE PLAN

### 1.1 Release Philosophy

Sakhi Clinic is a single-doctor, offline-first, zero-backend PWA. That shape changes what "release" means relative to a typical SaaS product: there is no fleet of servers to canary, no multi-tenant blast radius — but there is exactly one doctor's live clinical workflow, mid-consultation, that a bad release can interrupt. The release plan below is sized for that reality: fewer environments than a typical enterprise pipeline, but more manual verification gates per release than a typical low-stakes web app, because "rollback" for a PWA with local-only data has sharp edges (Section 1.6).

### 1.2 Release Candidate Process

| Stage | Gate | Owner |
|---|---|---|
| **RC cut** | `tsc --noEmit` clean, `npm run build` succeeds, full Vitest suite green (per `MODULE_A_TEST_REPORT.md`'s reproducibility fix — run from native storage, not a cross-OS mount), no open Critical/High items in the current module's risk register | Engineering |
| **RC smoke test** | Manual pass of `MODULE_A_RELEASE_CHECKLIST.md` §2–4 (fresh install, upgrade, migration validation) on a real Android Chrome device — not just the automated suite | Engineering + QA |
| **RC freeze** | No further code changes except defects found in smoke test; a build hash/timestamp is recorded as the RC identity | Engineering lead |
| **Doctor pilot sign-off** | Part 2 of this document, run against the frozen RC | Doctor + Engineering |
| **Production promotion** | RC is redeployed byte-identical (same build artifact, not a rebuild) to the canonical production origin | DevOps/deploy owner |

**Canonical origin lock is a release precondition, not a release feature.** Per `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` §4, the most probable cause of the original patient-data-loss incident was the app being served from more than one origin (dev server vs. preview URL vs. production URL), each of which is a structurally separate, empty IndexedDB database to the browser. Every release from this point forward must deploy to the **same fixed URL** the doctor's device already has installed. If the hosting provider, domain, or protocol (http→https) ever must change, that is not a normal release — it requires the origin-mismatch procedure in Part 5.4, planned in advance, never discovered by the doctor via the warning banner alone.

### 1.3 Doctor Pilot

A pilot is not a demo — it is the RC running the doctor's actual, current patient load for a bounded period before being declared production.

- **Duration:** minimum 5 consecutive clinic days (covers a full weekly cycle including the highest-volume day).
- **Environment:** the doctor's real device, the canonical origin, real (not synthetic) patients — this is the only way to exercise Module A's fixes (double-booking race, draft-autosave failure surfacing, origin-mismatch banner) under real conditions.
- **Support posture during pilot:** an engineer reachable same-day, not next-business-day. Any data-integrity concern raised by the doctor pauses new patient registration on that RC until resolved, per the "if anything looks wrong, stop and get in touch" guidance already in `DOCTOR_OPERATIONAL_GUIDE.md`.
- **Exit gate:** Part 2's full acceptance checklist completed with no unresolved Critical/High findings.

### 1.4 Production Rollout

Because this is a single-doctor product today, "rollout" is not a phased-percentage deployment — it is a single, well-prepared cutover:

1. Doctor takes a manual backup (Download Backup) immediately before cutover, per `MODULE_A_RELEASE_CHECKLIST.md` §1.
2. Deploy the frozen RC build to the canonical origin.
3. Doctor opens the app once, under light supervision (in person or a live call), confirms the "Today" screen loads, confirms `db.verno` matches expectation, confirms no unexpected origin-mismatch banner.
4. Spot-check at least 3 existing patients with consultation history (per the release checklist).
5. Declare the release live; begin the monitoring window (1.5 below).

**Multi-doctor/multi-device future note:** once Module C (Drive sync, Part 4) ships, "rollout" gains a second dimension — multiple devices syncing through one Drive account. This release plan should be revisited at that point; it is written for the current single-device reality.

### 1.5 Monitoring

Today, Sakhi Clinic has **no remote monitoring** — `operationalEvents` is a local Dexie table, not shipped anywhere. Until Module B/C's audit-log-to-cloud path exists (Part 4), monitoring is necessarily manual:

- **First 48 hours post-release:** doctor explicitly asked to report anything unusual (slow saves, unexpected banners, missing data) rather than assuming silence means success.
- **`operationalEvents` spot-check:** an engineer reviews the local event log (via the diagnostics panel) within the first week, looking specifically for `[maintenance.run.start]` events (confirms the background maintenance runtime — which now enforces the outbox cap per Module A — is actually running) and any `origin.baseline.recorded` / `origin.baseline.acknowledged` events (confirms the origin-identity check behaved as expected on first load).
- **Structural gap, flagged not deferred silently:** real production monitoring (crash reporting, remote error aggregation) is Module 10 (Production Hardening) work and does not exist yet. Until it does, "monitoring" is manual and doctor-dependent — this is an accepted, explicit limitation of the current phase, not an oversight.

### 1.6 Rollback

Rollback for this architecture has a sharp, non-obvious edge that must be understood before it is ever needed under pressure:

- **Code rollback is safe and cheap:** redeploying a previous build to the same origin does not corrupt or hide data — Dexie schema versions only move forward; an older build simply doesn't see newer tables (e.g., `appMeta`), which is harmless (proven in `dbCertification.test.ts` per Module A's certification).
- **Data rollback is not the same thing, and is much more limited.** There is no automatic point-in-time data rollback today. If a release corrupts data (not just code), the only recovery path is a manual backup file made *before* the incident — this is why Section 1.4's pre-cutover backup step is non-negotiable, not a formality.
- **Never attempt a manual Dexie schema downgrade.** Per `MODULE_A_RELEASE_CHECKLIST.md` §5: rollback is a code revert only.
- **Module B's `backupHistory` + versioned-restore work (Part 4) is what upgrades this from "one manual file, doctor-remembered" to "structurally guaranteed rollback points."** Until Module B ships, rollback safety is bounded by how recently and reliably the doctor took a manual backup — a real, disclosed gap.

### 1.7 Versioning

- **Adopt semantic versioning for the app itself** (`MAJOR.MINOR.PATCH`), surfaced in the diagnostics panel and in `package.json`. Module A's changes, once committed, should be tagged (e.g., `v1.1.0` — additive, non-breaking data-layer hardening).
- **Dexie schema version and app semantic version are tracked separately but cross-referenced** in a small released-versions table (already scaffolded conceptually by `versions.json` in the repo) — every release should record which Dexie `db.verno` it expects, so a support engineer can immediately tell if a doctor's device is on a stale schema.
- **Tag every release in git** with the commit hash it was built from (the certification reports already do this manually — formalize it as a required release step, not a nice-to-have).

---

# PART 2 — DOCTOR ACCEPTANCE PLAN

This plan is structured as a superset of `MODULE_A_RELEASE_CHECKLIST.md` §7, extended to the full daily clinical workflow rather than only Module A's specific fixes. It is designed to be run by the doctor herself, on her own device, in a supervised session.

### 2.1 Structure

Each workflow area below has: what to test, how to know it passed, and what "fail" looks like. Everything is phrased in doctor-observable terms, not engineering terms — consistent with how `DOCTOR_OPERATIONAL_GUIDE.md` is already written.

| Area | Test | Success signal | Fail signal |
|---|---|---|---|
| **Patient registration** | Register a new test patient with a real-looking name/phone. Delete afterward. | Patient appears immediately in the patient list with correct name/phone. | Patient missing, duplicated, or fields swapped. |
| **Appointment booking** | Book one appointment for a real slot. Then attempt to double-book the exact same date/time/clinic from two tabs in quick succession. | Single booking succeeds normally; the double-booking attempt shows exactly one success and one clear "This slot was just taken" message. | Both bookings succeed (silent double-booking) or the message is unclear/technical. |
| **Consultation** | Open a consultation, fill Chief Complaint, save, navigate away and back. | Data persists exactly as entered. | Any field silently empties or reverts. |
| **Voice dictation** | Dictate a short phrase in each language the doctor actually uses (see RVC-2 protocol, §0). | Transcript appears correctly, no duplication. | Duplicated text, wrong language, or missing words — and this must be checked against the *actual* RVC-2 record, not assumed passed. |
| **Prescription** | Add at least 2 medicines to a test consultation, save, reopen. | Medicines list persists with correct dosage/instructions. | Medicines lost, reordered incorrectly, or dosage corrupted. |
| **Search** | Search for the test patient by partial name and by phone number. | Patient found by both. | Patient not found, or wrong patient returned. |
| **Editing** | Edit the test patient's phone number and a past consultation's chief complaint. | Both edits persist after navigating away and back. | Edit silently reverts or applies to the wrong record. |
| **Backup** | Use Download Backup; confirm the file downloads and the doctor can locate it on the device. | File exists, doctor knows where it is, doctor has moved it off-device at least once (email/USB/cloud). | Doctor cannot find the file, or has never moved it off-device. |
| **Restore** | On a disposable/test instance only (never on the live database without an existing fresh backup first) — restore from the backup just taken. | All test data reappears correctly, row counts match. | Any row-count mismatch, missing patients, or broken patient↔consultation links. |
| **Migration** | Confirm after any release that includes a schema bump that the app opens without error and existing data is intact (see Release Checklist §3–4). | Silent, successful migration; all pre-existing records present. | Blank screen, visible error, or missing records after opening. |
| **Follow-up** | Set a follow-up date in the past for the test patient; confirm it appears as "overdue" wherever follow-ups are surfaced today. | Overdue follow-up is visible (today: only via manual inspection of `nextFollowUpDate` in the patient record — Module 4's dashboard does not exist yet, see Part 7). | Follow-up date doesn't save, or (once Module 4 ships) doesn't appear in the dashboard. |

### 2.2 Acceptance Checklist (Sign-off Form)

- [ ] All rows in §2.1 tested and passed, on the doctor's real device, on the frozen RC.
- [ ] RVC-2 voice validation protocol completed and attached (not assumed) — see §0.
- [ ] Doctor has made and located a real backup, on her real device, at least once.
- [ ] Doctor understands, in her own words, what the origin-mismatch banner means and who to contact if it appears unexpectedly (per `DOCTOR_OPERATIONAL_GUIDE.md`).
- [ ] Doctor understands, in her own words, that there is currently no automatic off-device backup (until Part 4/5 ships) and that she is the backup system today.
- [ ] No Critical or High severity issue from `BETA_1.0_RISK_REGISTER.md` was newly triggered during the pilot.
- [ ] Engineering sign-off: `MODULE_A_RELEASE_CHECKLIST.md` §1–6 all checked.

### 2.3 Success Criteria

The release is a success if every checklist item in §2.2 is checked, the 5-day pilot (Part 1.3) produced zero unresolved data-integrity reports, and the doctor explicitly states — not just implicitly tolerates — that the app is safe and usable for her real daily workload.

### 2.4 Exit Criteria

The acceptance process **ends** (moves from "pilot" to "production," or from "this release" to "the next release cycle") when:

1. §2.2 is fully checked, **and**
2. Any issue found during the pilot is either fixed-and-reverified or explicitly triaged as deferred with the doctor's informed agreement (never silently deferred), **and**
3. The doctor's own words confirm trust in the system for daily use — this is a deliberately human, not purely mechanical, exit gate, consistent with the product vision's "trusted colleague, not a tool" framing (`01_PRODUCT_VISION.md`).

---

# PART 3 — MODULE PRIORITIZATION

### 3.1 Scoring Basis

Re-prioritizing the 10 modules already defined in `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` §6, scored across the six dimensions requested: doctor value, clinical risk (if the gap stays open), business value, engineering dependency (what it blocks/needs), implementation effort, and operational risk (if built badly).

| Module | Doctor value | Clinical risk if unaddressed | Business value | Dependency position | Effort | Operational risk | Priority |
|---|---|---|---|---|---|---|---|
| **1. Production data architecture (→ Module B)** | Very High — direct fix to the incident that triggered all of this | Critical — repeat data loss is existential to trust | Very High — no doctor stays on software that loses records | Blocks Module 2 (Drive needs `backupHistory`) | Medium | Low if following the versioned-Dexie pattern already proven in v42–v50 | **1** |
| **2. Google Drive sync (→ Module C)** | Very High — closes "single device" fear permanently | Critical — same root cause as Module 1, unaddressed until this ships | Very High | Depends on Module 1; blocks true multi-device use | Medium-High | Medium — new external dependency (Google OAuth/Drive API), new failure modes | **2** |
| **4. Follow-up intelligence dashboard** | High — doctor's explicitly stated #1 *workflow* request (distinct from #1 *safety* request) | Medium — missed follow-ups are a real clinical-continuity risk, not existential | High — directly drives the product vision's "40% follow-up compliance" success metric | No dependency on 2/3/5 — can ship immediately after Module B | Low-Medium | Low | **3** |
| **3. Patient import (Excel)** | Medium-High — mostly a one-time onboarding need, but real for any legacy-data doctor | Medium — bad import (duplicates, corrupted rows) pollutes the clinical record long-term | Medium | Independent of 1/2/4 | Low-Medium | Medium — an import is the one operation that can corrupt many records at once if unguarded (needs the transactional rollback wrapper called out in the architecture assessment) | **4** |
| **6. Patient summary card** | High — directly requested (timeline, meds, follow-up, alerts in one view) | Low — pure read-aggregation, nothing new to persist | Medium-High | Depends on Module 4 (and partially Module 5) for full value | Low | Low | **5** |
| **5. WhatsApp reminder engine** | High — closes the loop from "dashboard shows overdue" to "patient actually gets reminded" | Low-Medium — a missed reminder is a workflow gap, not a data-integrity one | Medium-High | Depends on Module 4; real delivery tracking depends on an unmade provider decision (§14 of the architecture assessment) | Medium (approval/queue/history layer); Medium-High if/when a real Business API is added | Medium — outbound patient communication without doctor approval would be a real trust/safety issue if built wrong | **6** |
| **9. Clinical knowledge base** | Indirect (doctor doesn't touch this directly) but gates Modules 7/8's ceiling | Low today (nothing consumes it yet); High later if built on improperly licensed data | Medium — determines whether the AI pipeline is ever clinically credible | Blocks Modules 7 and 8 from being non-trivial | Variable — bounded by legal sourcing, not engineering | Low engineering risk, **High legal risk** if mishandled | **7** (start the licensing track early, in parallel, even though the app-facing payoff is later) |
| **8. Rubric engine** | Medium-High once it exists, but invisible until Module 7 surfaces it | Medium — an ungoverned rubric suggestion is exactly the "AI hallucination" Critical risk in the Risk Register | Medium | Depends on Module 9's data | Medium-High | Medium — mitigated structurally by mandatory doctor-approval-before-effect | **8** |
| **7. Homeopathic AI pipeline** | Very High if done well (the product's core differentiator per `01_PRODUCT_VISION.md`) — but High risk if rushed | Critical if AI output is ever mistaken for a final answer | Very High long-term, but not urgent relative to Modules 1/2/4 | Depends on Modules 8 and 9 | High | High — this is the module most capable of doctor-trust damage if shipped before it's ready | **9** |
| **10. Production hardening** | Low direct visibility, but underwrites trust in everything else | Varies by item (auth/encryption gaps are High; performance/pagination is Medium and growing) | Medium — necessary, not differentiating | Cuts across every other module (not a single phase) | Spread across all phases | High if deferred too long (e.g., shipping Drive sync, Part 4, without encryption is a real risk) | **Continuous — not ranked as a single slot** |

### 3.2 Optimal Implementation Order

This is the sequencing that follows from §3.1, expressed as the phase plan carried into Part 10:

1. **Module B** — Production Data Protection & Sync Foundation (the architecture assessment's Module 1, hardened)
2. **Module C** — Google Identity & Drive Backend (the architecture assessment's Module 2) — built *together* with Module B, see Part 4 for why
3. **Follow-Up Intelligence Dashboard** (Module 4)
4. **Patient Import — Excel** (Module 3) — can run in parallel with step 3, no shared dependency
5. **Patient Summary Card** (Module 6)
6. **WhatsApp Reminder Engine** (Module 5)
7. **Clinical Knowledge Base — licensing/sourcing track** (Module 9) — start in parallel with steps 3–6, since it's gated by legal timelines, not engineering capacity
8. **Rubric Engine** (Module 8)
9. **Homeopathic AI Pipeline** (Module 7)
10. **Production Hardening** (Module 10) — continuous throughout, with specific items pulled forward where they gate another module (e.g., encryption must land no later than Module C, since Drive backups need it immediately; a React error boundary should land in the very next release regardless of what else is in it)

This order is unchanged in its underlying logic from `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` §11 — the re-prioritization exercise confirms rather than overturns that plan, with one refinement: Modules 1 and 2 are now explicitly merged into a single combined delivery unit (Module B+C), reflecting how tightly their data models and failure-recovery stories are coupled (Part 4).

---

# PART 4 — MODULE B + MODULE C DESIGN

### 4.1 Why They Should Be Built Together

Module B (Production Data Protection & Sync Foundation) and Module C (Google Identity & Drive Backend) are presented as two modules for planning and staffing clarity, but they are **one delivery unit** for these concrete reasons:

- **Module C has nothing to sync until Module B exists.** Drive sync is only meaningful as a consumer of a well-formed, checksummed, versioned local backup — building Module C first would mean syncing an unstructured, unverified payload.
- **Module B's local safety net is incomplete without Module C.** A `backupHistory` table with perfect local versioning still lives entirely in the same browser origin as the primary data — per the architecture assessment's root-cause analysis (§4 of that document), a single origin-clearing event takes out data *and* every local safety net simultaneously. Module B alone closes "accidental corruption of the live database." Only Module C closes "the entire device is lost, stolen, or wiped."
- **They share one queue mechanism.** Both are designed as consumers of the existing `syncOutbox` table (already in the schema since v48, currently unconsumed) — building them separately risks two bespoke queues where one disciplined pattern suffices, a trap the architecture assessment explicitly warns against (§12).
- **They share one encryption decision.** Client-side encryption (Web Crypto API, AES-GCM) must exist before Drive ever receives a payload, so Drive only ever stores ciphertext. Sequencing encryption as a "Module 10 hardening item" that lands *after* Module C would mean shipping unencrypted patient data to a third-party cloud, even briefly — unacceptable for a clinical product. Building B+C together means encryption ships as a first-class part of the design, not a bolt-on.
- **One doctor-facing mental model.** From the doctor's side, "my data is safe" is a single concern, not two — she should not need to understand that "local versioned backup" and "cloud copy" are separate engineering milestones. One combined release means one combined explanation, one combined acceptance test (Part 2), one combined entry in `DOCTOR_OPERATIONAL_GUIDE.md`.

### 4.2 Shared Architecture

```
                    ┌─────────────────────────────┐
                    │   Local Dexie (SakhiClinicDB) │  ◄── single source of truth
                    │   patients / consultations /  │       for all live reads/writes
                    │   appointments / drafts / ...  │       (unchanged — Module A already
                    └───────────────┬────────────────┘        hardened this layer)
                                    │
                    on every clinically-meaningful write,
                    plus a scheduled interval, plus manual "Download Backup"
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │   backupHistory (new table)  │  Module B
                    │   {id, createdAt, recordCounts,│
                    │    checksum, location,        │
                    │    sizeBytes}                  │
                    └───────────────┬────────────────┘
                                    │
                    payload built from the same `sakhi.backup.v1`
                    export format Module A's audit already verified works
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │  Web Crypto (AES-GCM) encrypt │  Module B/C shared
                    │  client-side, before it ever  │  (encryption key never
                    │  leaves the device             │   leaves doctor's control)
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │  syncOutbox (existing table,  │  extended in meaning:
                    │  entityType: "backup")        │  entityType gains "backup"
                    └───────────────┬────────────────┘  alongside its existing values
                                    │
                    background maintenance runtime (already exists, Module A)
                    drains the outbox — this is a new *consumer*, not a new mechanism
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │   Google Drive REST API v3    │  Module C
                    │   "Sakhi Clinic Backups/"     │
                    │   dedicated app folder         │
                    └─────────────────────────────┘
```

### 4.3 Authentication Flow

- **Provider:** Google Identity Services (GIS) — modern, browser-native OAuth, no heavyweight SDK.
- **Scope:** the *narrowest* Drive scope that supports a dedicated visible folder (`drive.file` scope — access only to files/folders the app itself creates — not full Drive read/write). This is a deliberate trust-minimization choice: the app should never be able to see or touch the doctor's other Drive files.
- **Flow:**
  1. Doctor taps "Connect Google Drive" (never forced at first app open — Drive sync is additive, the app must remain fully usable without it, preserving offline-first as a first-class mode, not a degraded fallback).
  2. Standard OAuth consent screen, scoped as above.
  3. On first successful auth, the app checks for an existing `Sakhi Clinic Backups/` folder by name+metadata (idempotent — safe to re-run, never creates duplicates).
  4. Refresh tokens are stored via the browser's IndexedDB (encrypted, same key-management approach as Module 10), not `localStorage` — consistent with the existing architectural decision that all durable state goes through Dexie, not `localStorage` (`.brain/decisions.md`, Decision 4).
  5. Re-authentication is silent (standard OAuth refresh) unless the doctor explicitly signs out or the grant is revoked — she should never need to "log in" as part of her daily workflow; this is a background safety feature, not a gate on clinical work.

### 4.4 Google Drive Architecture

- **One dedicated app folder per doctor's Google account** (`Sakhi Clinic Backups/`), never the doctor's general Drive space.
- **Each `backupHistory` entry becomes one Drive file upload.** Drive's native file versioning is used *as* the version-history mechanism — this is a deliberate build-vs-buy choice: implementing custom version history and diffing would be significant, uncertain-value engineering; Drive already does this reliably for free.
- **Naming convention:** `sakhi-backup-{ISO timestamp}-{deviceId short}.enc` — human-scannable in the Drive UI even though the doctor should rarely need to open it directly.
- **Multi-device restore:** sign in with the same Google account on a new/replacement device → app detects no local data → offers "Restore from Drive" → pulls the latest backup → runs the same Module B restore flow already used for local files, just with the payload sourced from Drive instead of a manually-picked file. One restore code path, two payload sources — not two restore implementations.

### 4.5 Offline-First Strategy

Drive sync must never compromise offline-first — this is a non-negotiable, already-locked architectural principle (`.brain/decisions.md`, Decision 1; Product Vision's "Offline Capability: ✅ Yes" competitive claim). Concretely:

- All clinical writes (patient, consultation, appointment, prescription) complete against local Dexie **synchronously from the doctor's perspective**, with zero dependency on network or Drive availability — unchanged from today.
- The Drive push is strictly a background, best-effort, eventually-consistent operation via the outbox — exactly the same non-blocking pattern Module A already established for the outbox-cap enforcement (moved off the write path after the measured 100+ second risk). Drive sync inherits that lesson directly: it must never sit in the await chain of a clinical save.
- If the device is offline for days, backups queue in `backupHistory`/`syncOutbox` locally and drain to Drive whenever connectivity returns — no data is lost, no write is blocked, no error is shown to the doctor mid-consultation for a sync-layer problem.

### 4.6 Conflict Resolution

Deliberately simplified for the current product reality (single doctor, usually-single-active-device):

- **Local Dexie is always authoritative.** Drive is a mirror/off-device copy, never a second source of truth the app reads from during normal operation.
- **"Most recent local write wins."** If, in a rare multi-device scenario, two devices both wrote before either synced, the later `backupHistory` timestamp becomes the new Drive-recorded state — but **nothing is silently discarded**, because Drive's native version history retains every prior upload. A doctor (or support engineer) can always recover an earlier version manually if a "most recent wins" resolution turns out to be wrong.
- **Explicitly out of scope for this phase:** true multi-master merge (e.g., reconciling two devices that were both actively used offline for the same day). This is called out as a known simplification, appropriate today, and flagged as a design point to revisit only if/when the product genuinely moves to routine multi-device concurrent use (e.g., a second doctor, a receptionist device) — not before.

### 4.7 Backup Strategy

Three tiers, each with a distinct purpose (extending, not replacing, what already exists per the architecture assessment §1.4):

1. **Automatic local (`backupHistory`, Module B):** triggered on a schedule and before every schema-migrating release, versioned, checksummed. Fast-recovery tier — same device, seconds to restore.
2. **Automatic off-device (Drive, Module C):** every local backup entry mirrors to Drive in the background. Survives device loss — this is the tier that actually closes the root-cause gap.
3. **Manual export (existing `sakhi.backup.v1`, retained unchanged):** the doctor's own downloaded file remains available as a portable, doctor-controlled emergency copy — never the *only* line of defense once tiers 1–2 exist, but valuable as a doctor-verifiable, doctor-controlled fallback that doesn't depend on any account or network state at all.

### 4.8 Restore Strategy

- **Two-step confirm, always.** No restore is a single click. Step one shows a dry-run diff ("this will replace 142 patients, 380 consultations — continue?") computed by comparing the backup payload's record counts to the live database's, *before* anything is overwritten.
- **One restore code path, three entry points:** local file picker (existing), local `backupHistory` entry, Drive-sourced payload. All three converge on the same tested restore function — the destructive-restore-path test gap the due-diligence report already flagged as the top production blocker gets closed once, for all three entry points, not three times.
- **Restore is itself logged** to `operationalEvents`/`auditLog` (Module 10) — every restore is an auditable clinical-data event, not a silent operation.

### 4.9 Recovery Workflow

The doctor-facing runbook for "my data is gone or my device is gone":

1. Install/open the app on any device, any browser, at the canonical origin.
2. If no local data is detected, the app itself offers "Sign in with Google to restore your backups" — this is the one moment sign-in is proactively surfaced, not hidden behind a settings menu.
3. Doctor signs in; app lists available Drive backups (most recent first, with human-readable timestamps and record counts).
4. Doctor selects a backup; dry-run diff shown; doctor confirms; restore runs.
5. Doctor is guided to spot-check a few known patients before resuming normal work — same discipline as the release checklist's post-migration verification.

This directly replaces today's dead end, where `DOCTOR_OPERATIONAL_GUIDE.md` can only say "there is no exception to this pattern today... a backup file, made recently, stored somewhere other than this device" is the *only* safeguard. Module B+C makes that safeguard automatic instead of doctor-remembered.

### 4.10 Migration

- Both modules ship as **pure additive Dexie schema versions** (`backupHistory`, `driveSync` tables), following the exact `.version(N).stores({...})` pattern already proven and independently re-verified across v42→v50 (Module A's certification confirms this pattern's safety, including under rollback).
- No existing table's shape changes. No `.upgrade()` data-transform risk beyond what Module A already tested.
- Migration itself gets an automated test seeded against a realistic pre-Module-B fixture, closing the gap the architecture assessment flagged (§3, §12) — migrations exist but were untested for the *restore* path specifically; this is now non-negotiable for Module B.

### 4.11 Security

- **Encryption:** AES-GCM via the native Web Crypto API, client-side, before any payload leaves the device for Drive. Drive stores ciphertext only.
- **Key management (the open decision from the architecture assessment §14, resolved here as a recommendation, not unilaterally decided):** recommend a **doctor-set passphrase, combined with a locally-stored, Drive-backed-up recovery key file** — a middle path between "simple but unrecoverable if forgotten" and "safer but more engineering." The recovery key file is itself encrypted with the passphrase and stored alongside backups; if the doctor forgets the passphrase but still has the device, recovery is still possible; if she loses both device and memory of the passphrase, data is unrecoverable — this residual risk is disclosed to her explicitly at setup, not buried in a settings screen.
- **Scope minimization:** `drive.file` OAuth scope only (§4.3) — never request broader Drive access than the feature needs.
- **No plaintext patient data ever transmitted** to any third party as part of this module — Google only ever receives ciphertext blobs it cannot read.

---

# PART 5 — PATIENT DATA PROTECTION (COMPLETE STRATEGY)

This part treats Part 4's architecture as given and specifies the doctor-facing, scenario-by-scenario protection story — the highest-priority deliverable per the mission statement.

### 5.1 Google Sign-In

Optional, never forced, presented as "protect your patient data" rather than "create an account" — framing matters for a doctor who may associate "sign in" with unrelated consumer apps. One account per doctor; no multi-user/staff account model in this phase (explicitly deferred — see Part 3, Module 10's "no RBAC complexity needed yet" note from the architecture assessment).

### 5.2 Google Drive Backup — Automatic and Manual

| Mode | Trigger | Retention |
|---|---|---|
| **Automatic** | Background, on a schedule (e.g., every few hours of active use) plus always before a schema-migrating release | Drive's native version history — no explicit pruning needed in this phase; revisit only if storage-quota pressure becomes real |
| **Manual** | Doctor-initiated "Backup Now" button, for peace of mind before something she considers risky (a big import, a device change) | Same Drive folder, same version history |

### 5.3 Restore

Covered in full in Part 4.8. The doctor-facing summary: restore is always a two-step, diff-before-you-commit action, never a single click, regardless of whether the source is local or Drive.

### 5.4 Version History

Delivered "for free" via Drive's native file versions (Part 4.4) rather than custom infrastructure — each automatic/manual backup is a distinct, individually restorable version. The local `backupHistory` table provides the same capability offline/pre-Drive-connection, so version history exists even for a doctor who has not yet connected Drive, just with a smaller (device-local-only) window.

### 5.5 Encryption

Covered in Part 4.11. Doctor-facing summary: patient data is encrypted before it ever leaves her device; Google never sees readable patient information; the encryption key is tied to a passphrase she sets, with a recovery-key file as a safety net against forgetting it (residual risk disclosed at setup).

### 5.6 Recovery, Device Migration, and Every Named Loss Scenario

Directly updating the table already published in `DOCTOR_OPERATIONAL_GUIDE.md` (which today correctly states "NO" recoverable for every row) — this is what changes once Module B+C ships:

| Scenario | Recoverable today (Module A baseline) | Recoverable after Module B+C |
|---|---|---|
| Lost device | No — manual backup only | **Yes** — sign in with the same Google account on any device, restore from Drive |
| Browser reinstall | No — manual backup only | **Yes** — same recovery path, Drive is off-device by construction |
| New phone | No — manual transfer only | **Yes** — sign in, restore; no manual file transfer required |
| New laptop | No — manual transfer only | **Yes** — same |
| Android app uninstall/reinstall | No — manual backup only | **Yes** — same |
| Windows reinstall | No — manual backup only | **Yes** — same |
| Browser storage corruption | No repair mechanism | **Yes for data** (restore from Drive) — corruption detection itself (`runDexieHealthCheck`) still does not *repair* in place; recovery is via restore, not in-place repair, and that distinction should stay explicit in doctor-facing docs |
| Doctor forgets encryption passphrase, still has device | N/A (no encryption exists yet) | Recoverable via the local recovery-key file (§4.11) |
| Doctor forgets passphrase **and** loses the device | N/A | **Not recoverable** — this residual risk must be disclosed at setup, not discovered during a crisis |

`DOCTOR_OPERATIONAL_GUIDE.md` should be revised as part of Module B+C's release (not left describing the pre-Module-B world) — this is called out explicitly so it isn't forgotten as "just a doc update" at the end of the module.

---

# PART 6 — PATIENT IMPORT

Extends the already-solid CSV pipeline (`patientImportService.ts`, confirmed working with fuzzy header matching and 3 conflict modes per the architecture assessment) rather than building a parallel path.

### 6.1 CSV Import (existing, retained)

Already functional; carried forward unchanged as the reference implementation every other source normalizes into.

### 6.2 Excel Import (new)

- New dependency: `xlsx` (SheetJS) or `exceljs` (browser-safe parsing, no server round-trip needed).
- Parses `.xlsx`/`.xls` into the **same intermediate row format** the CSV path already produces — this is the key design decision: duplicate detection, fuzzy header matching, and the 3 conflict modes are inherited, not reimplemented.
- Multi-sheet files: doctor is prompted to pick the sheet if more than one contains patient-shaped data (heuristic: presence of name/phone-like columns).

### 6.3 Legacy Data Import

For doctors migrating from paper registers or another software product: same CSV/Excel pipeline is the on-ramp — no bespoke "legacy importer." If a legacy system's export is unusually shaped (e.g., one row per visit rather than one row per patient), a pre-processing mapping step is defined per-source as a configuration, not new code, keeping the core import engine single and well-tested.

### 6.4 Duplicate Detection

Existing fuzzy-match logic (name + phone normalization, already proven in the CSV path) is reused unchanged. Recommended enhancement given the risk this import work is scoring against (§3.1): surface a **confidence score** per suspected duplicate, not just a binary flag, so the doctor's review queue can be sorted by "almost certainly the same patient" vs. "possibly coincidental."

### 6.5 Merge Strategy

Three conflict modes already exist (per the architecture assessment) — carried forward: skip, overwrite, and merge-field-by-field. Merge mode should show a side-by-side diff (existing record vs. incoming row) before commit, not a silent field-by-field auto-merge — the doctor, not a heuristic, resolves genuinely ambiguous conflicts.

### 6.6 Validation

Per-row validation errors (already present in the CSV path) are extended to Excel; invalid rows are quarantined into a reviewable list rather than either silently dropped or blocking the entire import.

### 6.7 Conflict Resolution & Transactional Safety

The one genuine gap identified in the architecture assessment: **the write phase is not currently wrapped in a single Dexie transaction**, so a mid-import failure can leave a partially-imported, inconsistent state. This is fixed as part of Module 3's delivery, not deferred: `db.transaction('rw', ...)` wraps the entire commit phase, so any failure rolls back atomically — directly closing the "Migration failure" item already rated High severity in `BETA_1.0_RISK_REGISTER.md`.

### 6.8 Preview Before Commit

A formal preview screen (new/duplicate/conflicting row counts, with drill-down) is shown before any write happens — the CSV path already conceptually supports this; Module 3 formalizes it as a required step, not an optional one, for both CSV and Excel.

---

# PART 7 — FOLLOW-UP INTELLIGENCE

Combines Module 4 (dashboard) and Module 5 (WhatsApp reminders) as the doctor's explicitly stated top *workflow* request.

### 7.1 Overdue Follow-Ups

A read-model aggregation (no new source-of-truth table) querying `patients.nextFollowUpDate` against today's date. "Overdue" = date in the past with no subsequent consultation recorded since.

### 7.2 Upcoming Follow-Ups

Same aggregation, bucketed: today, next 7 days, next 30 days — surfaced as the doctor's landing view, extending the existing `TodayPage.tsx` rather than replacing it (per the architecture assessment's explicit recommendation).

### 7.3 Automatic Reminders

Reminders are **generated** automatically from the overdue/upcoming buckets but **never sent** without explicit doctor approval — this is not a style choice, it is a direct enforcement of the project's own binding AI/automation trust principle (`.brain/decisions.md`) applied equally to any outbound patient communication, and it directly mitigates a risk this document's own scoring (Part 3.1) flagged as real if built without that gate.

### 7.4 WhatsApp Reminders

- **Phase A (ship first):** formalize `whatsappService.ts`'s existing `wa.me` click-to-chat into an **approval queue** (`reminderQueue` table) — the doctor reviews and approves each reminder before it opens WhatsApp for her to send. This ships without any new external dependency or cost.
- **Phase B (provider-decision-gated):** once a real WhatsApp Business API provider is chosen (Meta Cloud API direct, or a BSP like Twilio/Gupshup — an open product/cost decision, not resolved unilaterally here), sends become trackable with real delivery status, and retries become automatable. Phase A's UI does not need to be rebuilt for Phase B — only the send/delivery-status backend changes underneath it.

### 7.5 Reminder Dashboard

One view: pending approval, approved-and-sent, delivery status (manually marked by the doctor until Phase B), and a simple "reminders sent this week" count — assembled from `reminderQueue` + `reminderHistory`, no new aggregation logic beyond what Modules 4/5 already produce.

### 7.6 Doctor Popup

A lightweight, dismissible surface (not a blocking modal — never interrupt an in-progress consultation) shown when the doctor opens the app each day: "You have N overdue follow-ups and M reminders awaiting approval." One tap navigates to the full dashboard.

### 7.7 Reminder History

`reminderHistory` table: every sent reminder, timestamp, channel, delivery status, retry count — this is also an `auditLog`-relevant record (Module 10), since it's a record of outbound patient communication.

### 7.8 Follow-Up Analytics

A simple trend view once enough history exists: follow-up compliance rate over time (directly measurable against the Product Vision's own stated 40% improvement target), most common reasons for missed follow-ups (if the doctor chooses to tag them), and reminder-to-completed-visit conversion rate. Deliberately scoped as a "nice to have that falls out of data already being collected," not a new engineering investment — sequenced after Modules 4/5 are live and have accumulated real data.

---

# PART 8 — PATIENT DASHBOARD

Pure aggregation/view-layer work (Module 6) — no new persisted data beyond what Modules 1–5(B, C, 4, 3, 5) already produce, per the architecture assessment's own scoping.

### 8.1 Timeline

Reuse `PatientHistoryTimeline.tsx` — **after** resolving the two-copy duplication already flagged in the architecture assessment (§12) as a prerequisite, not a parallel cleanup task, since building the dashboard on top of two divergent copies would immediately re-introduce the inconsistency risk named in the Risk Register ("Timeline corruption").

### 8.2 Medicines

Current medicines pulled from the most recent consultation's `medicines[]` array — already modeled, no schema change needed.

### 8.3 Follow-Up History

Every past `nextFollowUpDate` value and whether it was met, drawn from the consultation history — read-only aggregation.

### 8.4 Consultation Summary

Last visit date, diagnosis/outcome, and chief complaint from the latest `consultations` row for the patient — direct read, no new logic.

### 8.5 Outstanding Reminders

Pulled from Module 5's `reminderQueue`/`reminderHistory` for this specific patient.

### 8.6 Upcoming Visits

Pulled from `appointments` filtered to this patient, future-dated.

### 8.7 Outstanding Investigations

**Gap, named plainly:** there is currently no structured field in the `Consultation` model for "ordered but not yet reviewed" investigations/labs — this is free-text today at best. Recommend a small additive schema change (`pendingInvestigations: string[]` or a light structured record) as part of this module rather than faking this section from unstructured text, which would be unreliable and could create false reassurance that nothing is outstanding when something actually is.

### 8.8 Risk Indicators

Rule-based flags in the same spirit as the Risk Register itself: overdue chronic-case follow-up, a missed reminder with no subsequent contact, a consultation flagged by the doctor for review. Deliberately rule-based, not AI-generated, in this phase — keeps Module 6 free of the AI-trust complexity that Modules 7/8 exist specifically to manage carefully.

### 8.9 Clinical Notes

Existing free-text case fields, surfaced read-only in the summary view — no new capability, just visibility.

---

# PART 9 — HOMEOPATHIC AI (PRODUCTION WORKFLOW)

The AI pipeline, as specified, staged and doctor-reviewable at every step — never a single opaque call, and **always advisory**. This section describes workflow and governance; it does not prescribe implementation code, consistent with the "do not write code" instruction for this document.

### 9.1 The Staged Pipeline

```
Consultation Transcript (existing free-text fields — identical whether
typed or voice-dictated; Module A/voice work already confirmed this)
        │
        ▼
Clinical Summary
   (condenses the raw transcript into a structured clinical narrative —
    doctor-reviewable, editable before proceeding)
        │
        ▼
Symptom Extraction
   ({General, Mental, Physical} symptoms + modalities + particulars,
    pulled from the summary — each extracted symptom is a discrete,
    inspectable record, not a black-box embedding)
        │
        ▼
Rubric Suggestions  (Module 8)
   (each suggestion ties back to a specific patient statement, carries
    a confidence score and a stated reason, and requires explicit
    doctor approval before it affects anything downstream)
        │
        ▼
Repertorization
   (weights approved rubrics against the knowledge base, Module 9,
    to narrow the remedy field — a calculation the doctor can inspect,
    not a hidden ranking)
        │
        ▼
Materia Medica Comparison
   (cross-checks repertorization output against remedy-level detail —
    key symptoms, modalities, generals — for the shortlisted remedies)
        │
        ▼
Differential Remedies
   (the shortlist, with the *reasoning* for each candidate surfaced,
    not just a ranked list)
        │
        ▼
Prescription Draft
   (a suggested prescription — dosage/potency left to the doctor's
    judgment; this stage never auto-fills the final prescription record)
        │
        ▼
Doctor Review  ◄── the pipeline's actual endpoint.
   Every prior stage is an input to this one, never a bypass of it.
```

### 9.2 Governance, Restated as a Hard Constraint

- **Every stage's output is a persisted, auditable record** (`symptomExtractions`, `rubricSuggestions`, per the architecture assessment's schema), not transient UI state — this is what makes "doctor review" a real, inspectable gate rather than a UI label.
- **No AI/rubric output affects the clinical record until the doctor explicitly approves it.** This is the same principle Module A applied structurally to draft-autosave failures (surface, don't swallow) and to the origin-mismatch banner (warn, never block) — consistent product philosophy: the system surfaces information and asks for a decision; it does not make clinical decisions.
- **Confidence is always shown, never implied.** Directly closes the Risk Register's "AI confidence mismatch" Critical item — a low-confidence suggestion must never be presented with the visual weight of a high-confidence one.
- **The doctor remains the decision-maker at every stage, not just the last one.** She can stop, edit, or discard the pipeline's output at the Clinical Summary stage just as validly as at the final Prescription Draft stage — "advisory" applies throughout, not only at the end.

### 9.3 The One Open Decision That Gates Everything Else Here

Per the architecture assessment §14: whether later pipeline stages (symptom extraction, rubric matching) run purely local/rule-based (private, offline, weaker reasoning) or call an LLM API (stronger reasoning, but patient symptom text leaves the device — a privacy/consent question). This roadmap does not resolve that decision unilaterally — it is flagged here, again, as the single highest-leverage open decision in the entire AI workflow, and Part 10's timeline treats it as a blocking prerequisite for Module 7/8 implementation planning, not something to decide mid-build.

### 9.4 Dependency on the Knowledge Base

This entire pipeline is only as credible as Module 9's underlying data (Part 3.1's scoring reflects this — Module 9 is sequenced early specifically because it gates everything from Section 9.1 onward). An empty or thin repertory makes the pipeline structurally correct but practically vacuous; the licensing/sourcing track (Part 3.2, step 7) should start well before pipeline implementation begins, not in parallel with it starting from zero.

---

# PART 10 — MASTER ROADMAP

### 10.1 Milestones

| Milestone | Content | Depends on |
|---|---|---|
| **M0 — Stop the Bleeding** | Canonical origin lock finalized and documented; Module A committed (pending the two Module A follow-ups: outbox-cap test tiebreaker fix, stale `.git/index.lock` cleared — see `MODULE_A_TEST_REPORT.md`); React error boundary added; RVC-2 protocol completed (§0) | None — can start immediately |
| **M1 — Module B+C Live** | Automatic local + Drive backup, encrypted, restore-tested, doctor onboarded to Google sign-in | M0 |
| **M2 — Follow-Up Dashboard Live** | Overdue/upcoming buckets, doctor popup, landing-view integration | M0 (independent of M1) |
| **M3 — Excel Import Live** | Excel parser + transactional rollback wrapper + formal preview | M0 (independent of M1/M2) |
| **M4 — Patient Summary Card Live** | Full aggregation view: timeline, meds, follow-up, alerts | M2 (needs follow-up data), partially M5 |
| **M5 — WhatsApp Reminder Engine (Phase A)** | Approval queue + history against existing click-to-chat | M2 |
| **M5.1 — WhatsApp Reminder Engine (Phase B)** | Real Business API integration, delivery tracking | M5 + provider decision (§14 of architecture assessment) |
| **M6 — Knowledge Base Sourced** | Legally-clean rubric/materia-medica dataset in place | Can start in parallel with M1–M5 (legal/licensing track, not engineering-blocked) |
| **M7 — Rubric Engine Live** | `rubricSuggestions` table, doctor-approval workflow, synonym/pattern matching over M6's data | M6 |
| **M8 — AI Pipeline Live** | Full staged pipeline (Part 9), LLM-vs-local decision resolved and implemented | M6, M7, and the open decision in §9.3 |
| **M9 — Production Hardening Complete** | Auth (reused from M1), full audit logging, encryption (already required by M1), pagination/indexing, monitoring, restore-path test coverage | Continuous from M0; formally "complete" gate sits after M8 but individual items land throughout |

### 10.2 Critical Path

**M0 → M1 → M6 → M7 → M8**, with M9's encryption/auth work pulled forward to land no later than M1 (Drive backups cannot ship without it) and M9's remaining items (monitoring, pagination, full audit log) trailing continuously rather than gating the critical path.

The critical path is long specifically because of M6 (knowledge base licensing) and the §9.3 LLM decision — both are **decision-bound, not engineering-bound** delays. The single highest-leverage action to shorten the overall roadmap is resolving those two open decisions early, in parallel with M1's engineering work, rather than waiting until M1 ships to start those conversations.

### 10.3 Parallel Work Tracks

- **Track 1 (Data safety):** M0 → M1 — engineering-heavy, sequential internally, highest priority.
- **Track 2 (Workflow value):** M2, M3, M4, M5 — can run largely in parallel with each other and with Track 1 after M0, since none of them depend on Module B+C's data model.
- **Track 3 (AI foundation):** M6 (licensing) — starts immediately, runs in the background of Tracks 1 and 2, since it's gated by external negotiation timelines rather than internal engineering capacity.
- **Track 4 (Hardening):** continuous, with specific pull-forward obligations into Track 1 (encryption/auth) rather than being its own isolated phase.

### 10.4 Estimated Effort (Relative, Not Calendar Time)

Consistent with the effort ratings already established in `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` §6 and carried into Part 3.1 of this document: M1 (Module B+C) and M8 (AI Pipeline) are the two largest engineering investments in the roadmap (Medium-High and High respectively); M2, M3, M4 are each Low-Medium and suited to being staffed in parallel; M5's true effort is bimodal (Medium for the approval-queue phase, Medium-High only if/when a real Business API is added); M6 and the §9.3 decision are effort-light for engineering but schedule-heavy for legal/product decision-making, and should be started on their own clock rather than treated as "engineering backlog."

### 10.5 Release Milestones (tie-back to Part 1)

Each of M1 through M5 (and M7/M8 once ready) should be run through the full Part 1 release process (RC → pilot → rollout) and the full Part 2 acceptance plan independently — this roadmap deliberately does not recommend bundling multiple modules into one giant release, consistent with the architecture assessment's own warning (§9) against scope creep across modules shipped simultaneously.

### 10.6 Doctor Milestones

The moments this roadmap should be narrated back to the doctor in her own terms, not engineering terms:

1. "Your data now has an automatic backup to your Google account — you don't have to remember to do this anymore." (M1)
2. "Every morning, the app will show you who's overdue for a follow-up, without you having to check each patient." (M2)
3. "You can now bring in your existing patient list from Excel, not just CSV." (M3)
4. "Opening a patient now shows you everything about them in one place." (M4)
5. "You can review and send WhatsApp reminders for overdue patients, right from the follow-up list." (M5)
6. "The AI assistant can now suggest rubrics and remedies for your review — it never decides for you, exactly like we designed it." (M8)

### 10.7 Business Milestones

1. **Zero-data-loss posture achieved** (M1) — the single fact most likely to determine whether this doctor, and any future doctor, trusts the product enough to recommend it.
2. **Daily-use validated** (M2–M5 combined, once the doctor's own workflow — not just consultation, but follow-up and reminders — runs entirely inside the product).
3. **AI differentiation live** (M8) — the point at which the product's competitive claims in `01_PRODUCT_VISION.md` (voice-first, AI clinical assistant, homeopathic-specific) are fully substantiated, not aspirational.
4. **Second-doctor readiness** — explicitly *not* a milestone in this roadmap's scope, but worth naming as the next planning horizon once M9 (auth/hardening) is complete and the multi-device conflict-resolution simplification in Part 4.6 is revisited.

---

## Closing Note

This roadmap does not recommend a rewrite, a re-architecture, or discarding any completed work — consistent with Module A's own certification and the architecture assessment's core verdict: **the foundation is sound; what remains is disciplined, sequenced, additive construction on top of it.** No code has been written or modified as part of producing this document. Implementation of Module B begins only after this roadmap receives architectural approval.
