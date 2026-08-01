# SAKHI CLINIC
# PRODUCTION RELEASE 1.0
## EXECUTION PACKAGE

**Prepared as:** CTO / Product Delivery Manager / Clinical Operations Consultant / Healthcare Quality Manager / Release Manager / Risk Manager review
**Date:** 2026-08-01
**Status:** Operational handbook for the first production rollout. No architecture redesign, no new modules, no code. This package operationalizes decisions already made in `SAKHI_CLINIC_PRODUCTION_EXECUTION_ROADMAP_V2.md`, `MODULE_A_CERTIFICATION_REPORT.md`, `MODULE_A_TEST_REPORT.md`, `MODULE_A_RELEASE_CHECKLIST.md`, `BETA_1.0_RISK_REGISTER.md`, and `DOCTOR_OPERATIONAL_GUIDE.md` — it does not re-derive or second-guess them.

**Scope of Release 1.0:** Module A (Production Data Layer hardening) as certified GO WITH CONDITIONS. This package exists specifically to close those conditions operationally and carry the product from "engineering complete" to "daily clinical production use," per the roadmap. It does not include Module B, Module C, or any module beyond Module A — those are sequenced in Part 10 as future work, not part of this release.

---

# PART 1 — PRODUCTION RELEASE PLAN

### 1.0 Stage Overview

| Stage | Purpose | Nominal duration |
|---|---|---|
| Release Candidate (RC) | Freeze a specific, verified build | 1–2 days |
| Internal Verification | Engineering/QA confirms the RC against certification evidence | 1–2 days |
| Doctor Pilot | Real clinical use of the frozen RC | 5 clinic days minimum |
| Production Deployment | Cutover to canonical origin | 1 day |
| Stabilization Period | Heightened monitoring window, no new features | 14 days |
| Release Closure | Formal sign-off, retrospective, freeze lifted for next cycle | 1 day |

### 1.1 Release Candidate

**Objectives:** produce one specific, immutable, identifiable build that every later stage refers to by the same identity (commit hash + build timestamp), never a moving target.

**Deliverables:**
- RC build artifact (`dist/`), tagged with git commit hash and build timestamp.
- RC evidence bundle: `MODULE_A_TEST_REPORT.md` output attached, `tsc --noEmit` output, `npm run build` output, full Vitest run output (native filesystem, per the reproducibility fix already documented).

**Entry criteria:**
- All 13 real code changes in the current working tree (per the Module A repository-state cleanup) are committed on a release branch (Part 9).
- The known open Module A items are resolved or explicitly waived by name: (a) the `outboxCap.test.ts` timestamp-tiebreaker flake fixed or the risk formally accepted in writing, (b) the stale `.git/index.lock` cleared, (c) RVC-2 voice validation protocol completed and attached.

**Exit criteria:**
- `tsc --noEmit`: clean, exit 0.
- `npm run build`: succeeds, `dist/` produced with PWA precache, run from native filesystem (not a cross-OS/network-bridged mount, per `MODULE_A_TEST_REPORT.md` §2).
- Full Vitest suite: 206/206 passed, on **two consecutive clean runs**, not one (given the documented ~50% intermittent-failure rate of the unresolved `outboxCap.test.ts` tiebreaker at time of writing — two consecutive clean runs is the minimum bar that meaningfully rules out that specific known flake by chance).
- RC identity (commit hash, build timestamp) recorded in the evidence bundle.

**Dependencies:** none — this is the first stage.

**Success metric:** RC cut with zero re-cuts due to a failed exit-criteria check (a re-cut is not a failure of this plan, but tracking it tells you whether entry criteria were actually met before the RC was declared).

---

### 1.2 Internal Verification

**Objectives:** confirm the RC behaves correctly under supervised, non-clinical conditions before any real patient data is at risk.

**Deliverables:** completed `MODULE_A_RELEASE_CHECKLIST.md` §1–6 (pre-installation through post-deployment verification), performed against the actual RC build, by someone who did not build it (a second pair of eyes, not the author re-checking their own work).

**Entry criteria:** RC exists and passed Part 1.1's exit criteria.

**Exit criteria:**
- Fresh-install path verified on a real Android Chrome device (not just the automated suite) — `db.verno` reaches 50, no console errors, no unexpected origin-mismatch banner.
- Upgrade path verified against a device carrying pre-Module-A data — migration completes silently, all pre-existing records intact, spot-checked against at least 3 patients with consultation history including prescribed medicines.
- Double-booking race manually reproduced and confirmed fixed (two tabs, same slot, same moment).
- Draft autosave manually confirmed to survive a 30+ second pause and to surface a visible failure state if forced to fail.
- All items in this section signed off by name, with date and device used — not a blanket checkbox.

**Dependencies:** Part 1.1.

**Success metric:** zero manual findings that were not already known from the automated evidence bundle. Any new finding here is itself a signal that the automated suite has a coverage gap worth logging (not just fixing silently).

---

### 1.3 Doctor Pilot

Full detail in Part 2. Summarized here for release-plan continuity.

**Objectives:** validate the RC against real clinical use, real patient data, real daily volume — the only verification tier that can catch what supervised internal testing cannot (real interruptions, real network conditions, real device quirks, real doctor judgment about what "feels wrong").

**Deliverables:** completed doctor acceptance checklist (Part 2.7), daily pilot review logs (Part 2.6), a pilot closure summary.

**Entry criteria:** Part 1.2 exit criteria met; doctor has been briefed on what's changing and why (in her own terms, per `DOCTOR_OPERATIONAL_GUIDE.md`'s existing tone); doctor has taken a fresh manual backup immediately before pilot start.

**Exit criteria:** see Part 2.8 (Success/Failure/Exit Criteria) — summarized as zero unresolved Critical/High findings and the doctor's explicit statement of trust in the system for daily use.

**Dependencies:** Part 1.2.

**Success metric:** pilot completes its full minimum duration (5 clinic days) without a Critical finding forcing a restart of the pilot clock.

---

### 1.4 Production Deployment

**Objectives:** cut over the doctor's real, live workflow from whatever she is using today to the certified RC, at the canonical origin, with zero ambiguity about which build is live.

**Deliverables:** deployment log (who, when, which commit hash, which origin), doctor confirmation of first successful post-deployment session.

**Entry criteria:** Part 1.3 exit criteria met; a fresh manual backup taken within the hour before cutover; canonical origin confirmed unchanged from the pilot (deploying to a *different* origin at this stage would itself reproduce the exact failure mode Module A exists to prevent — see `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` §4).

**Exit criteria:**
- The RC build (byte-identical artifact, not a rebuild) is live at the canonical origin.
- Doctor opens the app once under light supervision; confirms "Today" screen loads, `db.verno` = 50, no unexpected origin-mismatch banner.
- At least 3 existing patients with consultation history spot-checked as intact.
- Deployment logged with commit hash and timestamp, cross-referenced to the RC identity from Part 1.1 — no unexplained gap between "what was tested" and "what is live" is acceptable.

**Dependencies:** Part 1.3.

**Success metric:** deployment completes in a single attempt with no rollback triggered within the first 24 hours.

---

### 1.5 Stabilization Period

**Objectives:** hold a 14-day window of heightened attention and a feature freeze (Part 5.5) before declaring the release fully closed — this is where a release earns its certification, not just receives it.

**Deliverables:** daily (first 48 hours) then every-other-day operational-event spot-checks (Part 7.1), a running incident log (Part 4, even if empty), a stabilization summary at day 14.

**Entry criteria:** Part 1.4 exit criteria met.

**Exit criteria:**
- Zero unresolved Critical incidents (Part 4.1) during the window.
- Zero data-integrity reports from the doctor.
- Backup verification (Part 7.2) passed at least twice during the window.
- No emergency release (Part 5.3) was required — if one was, the stabilization clock restarts from that event, not from original deployment.

**Dependencies:** Part 1.4.

**Success metric:** the 14-day window completes without a clock restart.

---

### 1.6 Release Closure

**Objectives:** formally close Release 1.0, freeze lifted, next cycle (Part 10) authorized to begin planning (not implementation — that requires separate, explicit approval per this document's own stop condition).

**Deliverables:** signed closure record (Part 8's Go/No-Go checklist retroactively confirmed still true at closure, a one-page retrospective: what worked, what didn't, what the next cycle's release plan should change).

**Entry criteria:** Part 1.5 exit criteria met.

**Exit criteria:** closure record signed by engineering lead and doctor; retrospective filed alongside this document, not lost in chat history.

**Dependencies:** Part 1.5.

**Success metric:** closure happens on or before day 15 of stabilization (i.e., closure is not itself allowed to drift indefinitely once stabilization criteria are met).

---

# PART 2 — DOCTOR PILOT PLAN

### 2.1 Duration

**Minimum 5 consecutive clinic days**, covering one full weekly cycle including the doctor's highest-volume day. If any day is skipped (doctor unavailable, clinic closed), the pilot extends by that many days rather than counting a shorter window — the point is 5 days of actual use, not 5 calendar days.

### 2.2 Daily Activities

| Day | Focus | Activity |
|---|---|---|
| Day 1 | Baseline + registration-heavy | Normal clinic day; explicitly register at least 1 new test-adjacent real patient if volume allows; engineer reachable, not necessarily on-site |
| Day 2 | Consultation + voice | Normal clinic day, with explicit attention to voice dictation across every language the doctor actually uses (ties to RVC-2, roadmap §0) |
| Day 3 | Appointment/queue stress | Normal clinic day; if volume allows, deliberately attempt a near-simultaneous double-booking as a real-world (not synthetic) test of the Module A fix |
| Day 4 | Follow-up + editing | Normal clinic day, with explicit attention to editing past consultations/patient records and confirming edits persist |
| Day 5 | Backup + full-cycle review | Normal clinic day; doctor performs a real Download Backup at end of day; full pilot review conducted (2.6) |

### 2.3 Clinical Workflow Coverage

Every pilot day must include, at minimum: opening the app fresh (not resuming a background tab), at least one full consultation start-to-finish, at least one save-and-reopen of an existing patient. This is not a scripted test day — it is the doctor's real clinic day, observed and logged, which is the entire point of a pilot versus a QA cycle.

### 2.4 Expected Usage

Whatever the doctor's real daily patient volume is — the pilot does not manufacture synthetic volume. If real volume on a given day is unusually low (e.g., a half-day), that day still counts but is noted as lower-confidence coverage in the daily review log.

### 2.5 Pilot Objectives

1. Confirm Module A's fixes (atomic booking, draft-autosave failure surfacing, origin-identity check) behave correctly under real, not synthetic, conditions.
2. Surface any defect that supervised internal testing structurally cannot catch (real network drops, real device battery/storage pressure, real interruption patterns mid-consultation).
3. Build the doctor's own confidence and familiarity with what changed, ahead of full production reliance.

### 2.6 Daily Review Process

At the end of each pilot day, a short structured review (10–15 minutes, doctor + engineer, call or in-person):

**Daily Pilot Review Log — Template**

```
Date:
Pilot Day #: (1-5)
Patients seen today:
New registrations today:
Consultations completed today:
Voice dictation used (Y/N, languages):
Anything that felt slow, wrong, or confusing? (doctor's own words, verbatim):
Any error message, banner, or unexpected screen seen? (describe or screenshot):
Was a backup taken today? (Y/N):
Doctor's one-line confidence rating today (1-5, 5 = fully trust it):
Engineer follow-up needed? (Y/N, what):
```

Logs are cumulative — Day 5's review includes a quick read-back of Days 1–4 to check for a pattern (e.g., "slow" mentioned on 3 of 5 days is a signal even if no single day rated it as a hard failure).

### 2.7 Acceptance Checklist

This is the same checklist as `SAKHI_CLINIC_PRODUCTION_EXECUTION_ROADMAP_V2.md` Part 2.2, run at pilot close:

- [ ] All clinical workflow areas (Part 3 of this document) tested and passed on the doctor's real device, on the frozen RC.
- [ ] RVC-2 voice validation protocol completed and attached.
- [ ] Doctor has made and located a real backup, on her real device, at least once during the pilot.
- [ ] Doctor understands, in her own words, what the origin-mismatch banner means and who to contact if it appears unexpectedly.
- [ ] Doctor understands, in her own words, that there is no automatic off-device backup yet and that she is the backup system today.
- [ ] No Critical or High severity item from `BETA_1.0_RISK_REGISTER.md` was newly triggered during the pilot.
- [ ] All 5 Daily Pilot Review Logs completed and filed.

### 2.8 Success Criteria

The pilot succeeds if: all 5 days completed, Part 2.7 fully checked, zero unresolved Critical incidents (Part 4.1) raised during the window, and the doctor's Day 5 confidence rating (Part 2.6) is 4 or 5.

### 2.9 Failure Criteria

The pilot fails — meaning it does not proceed to Production Deployment without remediation and a restart of the pilot clock — if any of the following occur:

- A Critical incident (Part 4.1) involving actual or near-miss data loss.
- Any single day's confidence rating of 1 or 2, without a same-day resolved explanation.
- The doctor states, in any words, that she does not trust the system with real patient data.
- More than one High severity finding remains unresolved at Day 5.

### 2.10 Exit Criteria

Identical structure to the roadmap's Part 2.4: the pilot ends (moves to Production Deployment) only when Part 2.7 is fully checked, every finding is either fixed-and-reverified or explicitly triaged with the doctor's informed agreement, and the doctor's own words confirm readiness — never inferred from silence.

---

# PART 3 — CLINICAL TEST SCENARIOS

Each scenario below is a ready-to-run checklist: preconditions, steps, expected result, pass/fail line. These are the scenarios to actually execute during Internal Verification (Part 1.2) and to watch for organically during the Doctor Pilot (Part 2).

### 3.1 New Patient Registration

- **Preconditions:** app open, on "Patients" or registration screen.
- **Steps:** enter a real-looking name, phone number, and any other required field; save.
- **Expected result:** patient appears immediately in the patient list with correct name/phone; ID is a random UUID, not a timestamp-based value (Module A fix).
- [ ] PASS / [ ] FAIL — Notes:

### 3.2 Follow-Up Patient (Returning)

- **Preconditions:** an existing patient with at least one prior consultation.
- **Steps:** search for the patient; open a new consultation; confirm prior history/timeline is visible.
- **Expected result:** prior consultations, medicines, and follow-up date are visible and correct before the new consultation is even started.
- [ ] PASS / [ ] FAIL — Notes:

### 3.3 Prescription

- **Preconditions:** an open consultation.
- **Steps:** add at least 2 medicines with dosage/instructions; save; reopen the consultation.
- **Expected result:** medicines list persists exactly as entered, correct order, correct dosage.
- [ ] PASS / [ ] FAIL — Notes:

### 3.4 Appointment Booking (Including Double-Booking)

- **Preconditions:** an existing patient, a known-free slot.
- **Steps:** book the slot normally; confirm success. Then, from two browser tabs/devices, attempt to book the identical date/time/clinic slot within seconds of each other.
- **Expected result:** the single booking succeeds normally. The near-simultaneous double-attempt results in exactly one success and one clear message: "This slot was just taken by another booking. Please choose a different time."
- [ ] PASS / [ ] FAIL — Notes:

### 3.5 Voice Consultation

- **Preconditions:** microphone permission granted, quiet-enough environment.
- **Steps:** dictate a short phrase in each language the doctor uses (per RVC-2 protocol phrase list — Gujarati, Hindi, English, mixed).
- **Expected result:** transcript appears correctly in the target field, no duplication, no dropped words.
- [ ] PASS / [ ] FAIL — Notes:

### 3.6 Patient Search

- **Preconditions:** at least one known patient exists.
- **Steps:** search by partial name; search by phone number.
- **Expected result:** correct patient found by both methods; no false matches for a distinctly different patient.
- [ ] PASS / [ ] FAIL — Notes:

### 3.7 Consultation Editing

- **Preconditions:** an existing, saved consultation.
- **Steps:** edit the Chief Complaint field of a past consultation; save; navigate away; return.
- **Expected result:** edit persists exactly; no other fields were altered as a side effect.
- [ ] PASS / [ ] FAIL — Notes:

### 3.8 Medicine Changes (Add/Remove/Edit Mid-Consultation)

- **Preconditions:** an open consultation with at least 1 medicine already added.
- **Steps:** add a second medicine, then remove the first, then edit the second's dosage; save.
- **Expected result:** final saved state reflects only the second medicine, with the edited dosage — no ghost entries, no duplicate rows.
- [ ] PASS / [ ] FAIL — Notes:

### 3.9 Draft Autosave Under Interruption

- **Preconditions:** an open consultation with unsaved Chief Complaint text.
- **Steps:** type text, wait 30+ seconds without saving, then simulate a failure if practical (e.g., forcibly close the tab) or simply navigate away and back.
- **Expected result:** either the draft is recovered on return, or — if autosave itself failed — a visible "Draft save failed" status is shown (Module A fix: failures are surfaced, never silently swallowed).
- [ ] PASS / [ ] FAIL — Notes:

### 3.10 Backup

- **Preconditions:** app open, Dashboard/diagnostics accessible.
- **Steps:** use Download Backup; locate the downloaded file; move it off-device (email/USB/cloud) at least once.
- **Expected result:** file downloads successfully, doctor can locate and has moved it off-device.
- [ ] PASS / [ ] FAIL — Notes:

### 3.11 Restore

- **Preconditions:** a valid backup file exists; **performed only on a disposable/test instance, never on the live database without a fresh backup already in hand.**
- **Steps:** use Restore Backup, select the file, confirm the destructive-overwrite warning, complete restore.
- **Expected result:** all data from the backup reappears correctly; row counts for patients/consultations/appointments match the source; no broken patient↔consultation links.
- [ ] PASS / [ ] FAIL — Notes:

### 3.12 Migration (Schema Upgrade)

- **Preconditions:** a device with pre-Module-A data (schema v49 or earlier), about to open the new build for the first time.
- **Steps:** open the app; observe first-load behavior.
- **Expected result:** migration to v50 completes silently, no visible error, no blank screen; all pre-existing patients/consultations/appointments intact; `appMeta` table has exactly one row afterward.
- [ ] PASS / [ ] FAIL — Notes:

### 3.13 Patient Import (CSV, Existing Capability)

- **Preconditions:** a well-formed CSV file with a mix of new and duplicate-looking patient rows.
- **Steps:** run the import; review the duplicate-detection results; complete the import.
- **Expected result:** new patients added correctly; duplicates flagged, not silently created twice; any malformed row produces a clear per-row error rather than aborting the whole import silently.
- [ ] PASS / [ ] FAIL — Notes:

---

# PART 4 — PRODUCTION INCIDENT MANAGEMENT

### 4.1 Incident Severity

| Severity | Definition | Example |
|---|---|---|
| **Sev1 — Critical** | Actual or imminent patient data loss or corruption; app entirely unusable for clinical work | Restore silently produces wrong data; app fails to open at all |
| **Sev2 — High** | A core clinical workflow is broken or produces incorrect results, but data is not at risk | Double-booking fix regresses; prescription medicines don't save |
| **Sev3 — Medium** | A workflow is degraded or inconvenient but has a usable path around it | Slow save under an unusual condition; a banner shows incorrect but non-blocking text |
| **Sev4 — Low** | Cosmetic, or affects a non-clinical/administrative feature only | Layout glitch in a rarely-used screen |

### 4.2 Priority

Priority is severity **adjusted by** current exposure — a Sev2 actively affecting the doctor's next consultation outranks a Sev1 that only reproduces under a rare, already-worked-around condition. Priority is set by the release/incident owner (4.4), not automatically derived from severity alone.

### 4.3 Escalation

| Time since report, unresolved | Sev1 | Sev2 | Sev3 | Sev4 |
|---|---|---|---|---|
| Immediate | Engineer paged/contacted directly | Engineer notified same-day | Logged, next business day | Logged, next release cycle |
| +2 hours | Escalate to engineering lead if no acknowledgment | — | — | — |
| +4 hours | Escalate to whoever owns the go/no-go decision (Part 8); consider emergency rollback (Part 5.4) | Escalate to engineering lead if no acknowledgment | — | — |
| +24 hours | — | Escalate to engineering lead if unresolved | Escalate to engineering lead if unresolved | — |

### 4.4 Owner

One named engineering owner per incident, assigned at intake, never left unassigned. The owner is responsible for driving the incident through RCA, corrective action, verification, and closure — even if they delegate specific steps.

### 4.5 Root Cause Analysis

Required for every Sev1 and Sev2. Format: what happened (observable symptom), what was the actual mechanism (not just the symptom restated), why did existing tests/checks not catch it, what specifically will prevent recurrence. Modeled directly on the evidence discipline already established in `MODULE_A_TEST_REPORT.md` §4 (the outbox-cap tiebreaker root-cause writeup is the reference standard for how specific an RCA here should be — not "a timing issue," but the actual mechanism).

### 4.6 Corrective Action

The fix that resolves the immediate incident. Must be independently verifiable (a test that fails before the fix and passes after, or an equivalent manual reproduction-then-confirmation), not just "changed the code and it seems fine now."

### 4.7 Preventive Action

The change that prevents the *class* of issue from recurring, which may be broader than the specific fix (e.g., if an incident traces to a cross-filesystem-mount test-environment issue like the one documented in `MODULE_A_TEST_REPORT.md` §2, the preventive action is "always run the verification suite from native storage," not just "this one test now passes").

### 4.8 Verification

Independent re-confirmation (not by the person who wrote the fix) that the corrective action resolves the incident and the preventive action is actually in place — mirrors the "trust but verify" discipline already applied throughout Module A's certification.

### 4.9 Closure

An incident closes only when RCA, corrective action, preventive action, and verification are all complete and recorded. A Sev1/Sev2 incident is never closed on "seems fine now" alone.

### 4.10 Templates

**Incident Report Template**

```
Incident ID:
Date/time reported:
Reported by:
Severity (Sev1-4):
Priority:
Owner:
Symptom (what was observed):
Affected area (registration / consultation / appointment / voice /
  prescription / search / backup / restore / migration / import / other):
Immediate impact (data at risk? Y/N — describe):
Immediate mitigation taken:
Status: Open / In RCA / Corrective action in progress / Verifying / Closed
```

**Root Cause Analysis Template**

```
Incident ID (cross-reference):
What happened (observable symptom):
Actual mechanism (not the symptom restated — the real "why"):
Why existing tests/checks did not catch this:
Corrective action taken:
How corrective action was verified (test or reproduction steps):
Preventive action (class-level fix, not just this instance):
How preventive action was verified:
Signed off by (name, date):
```

---

# PART 5 — CHANGE CONTROL

### 5.1 Bug Fixes (Routine)

Standard flow: reported (Part 4 or Part 6) → triaged into severity/priority → fixed on a branch off the release branch (Part 9.2) → full Vitest suite + `tsc` clean → code review by someone other than the author → merged → included in the *next* planned release, not deployed individually mid-stabilization unless it's a hotfix (5.2).

### 5.2 Hotfixes

Reserved for Sev1/Sev2 issues found during Stabilization (Part 1.5) that cannot reasonably wait for the next planned release. Same technical bar as a routine bug fix (tests, review) but compressed timeline — same-day where the severity demands it. Every hotfix restarts the Stabilization clock (Part 1.5) from the hotfix's deployment date, not the original deployment date.

### 5.3 Emergency Releases

Reserved for Sev1 only: active or imminent data loss/corruption in production. Emergency release skips the full Internal Verification cycle (Part 1.2) **only** for the specific fix being deployed, but still requires: the fix passes `tsc` + the full test suite, a second engineer reviews the diff before merge (never a unilateral emergency push), and the doctor is informed *before* the emergency deploy happens wherever the timeline allows it (not after the fact, except in the most extreme "app is actively corrupting data right now" case).

### 5.4 Rollback

Directly inherits the distinction already established in the roadmap (Part 1.6): **code rollback is safe and cheap** (redeploy the previous build to the same origin — Dexie schema versions only move forward, an older build simply doesn't see newer tables, which is harmless). **Data rollback is not the same thing** — there is no automatic point-in-time data rollback; the only data recovery path is a manual backup taken before the incident. Rollback decision authority sits with whoever owns the go/no-go decision (Part 8), triggered by: a Sev1 incident with no same-day corrective action available, or a stabilization-period trend indicating the release itself (not an isolated bug) is unsafe. **Never attempt a manual Dexie schema downgrade** — rollback is a code revert only, per `MODULE_A_RELEASE_CHECKLIST.md` §5.

### 5.5 Feature Freeze

In effect from RC cut (Part 1.1) through the end of Stabilization (Part 1.5) — no new features, only fixes to what's already in the RC, admitted through 5.1–5.3. Any request to add scope during a freeze is logged into the feedback system (Part 6) for the *next* cycle's planning, not smuggled into the current release.

### 5.6 Approval Workflow

| Change type | Requires |
|---|---|
| Routine bug fix | Code review (second engineer) + passing tests |
| Hotfix | Code review + passing tests + engineering lead notified before deploy |
| Emergency release | Code review + passing tests + engineering lead approval + doctor notified (before if possible, immediately after if not) |
| Rollback | Engineering lead or go/no-go owner decision, doctor informed as part of the action, not after |
| Feature-freeze exception | Explicit written approval from whoever owns the go/no-go decision — the default answer is no |

---

# PART 6 — DOCTOR FEEDBACK SYSTEM

### 6.1 Daily Feedback Form

Used during the pilot (Part 2.6) and optionally continued into Stabilization. Same structure as the Daily Pilot Review Log, reusable beyond the pilot window:

```
Date:
What worked well today:
What felt slow, wrong, or confusing (verbatim, doctor's own words):
Anything you had to work around:
Confidence rating today (1-5):
```

### 6.2 Feature Request Log

Explicitly separate from bug reports (6.3) — a feature request is a "this doesn't exist yet" observation, not a defect. Logged, never implemented mid-freeze (Part 5.5), and fed into the Part 10 post-release planning sequence rather than argued about in the moment.

```
Date:
Requested by:
What the doctor wants to be able to do:
What she does today instead (the current workaround, if any):
Which existing roadmap module (if any) this maps to — Module B, C,
  Patient Import, Follow-Up Intelligence, Patient Dashboard, Rubric
  Engine, Clinical AI, or "none identified yet":
```

### 6.3 Bug Report Template

```
Date/time:
What were you trying to do:
What happened instead:
What did you expect to happen:
Can you reliably make it happen again? (Y/N/Sometimes):
Screenshot or exact error text, if any:
```

This feeds directly into Part 4's Incident Report intake — a doctor-reported bug becomes an Incident Report once triaged, not a parallel, disconnected record.

### 6.4 Clinical Workflow Observations

Distinct from bug reports — these are observations about whether the software fits the actual clinical workflow, not whether it's broken. Directly relevant to future roadmap prioritization (roadmap v2.0 Part 3), not to this release's defect list.

```
Date:
Observation (what part of your normal workflow did this touch):
Does the software match how you actually work, or fight it:
Suggested change, if any (optional):
```

### 6.5 Priority Scoring

Applied uniformly across 6.2–6.4 items, using the same dimensions already established in the roadmap's module-prioritization scoring (v2.0 Part 3.1) so feedback triage stays consistent with how the rest of the product is prioritized: doctor value, clinical risk if unaddressed, implementation effort (rough order-of-magnitude only at intake), and whether it blocks or is blocked by an already-sequenced module. Formal scoring is applied only to items destined for the post-release roadmap (Part 10) — bug reports are triaged by severity (Part 4.1), not this scoring model.

---

# PART 7 — PRODUCTION SUPPORT PLAYBOOK

### 7.1 Daily Health Checks

During Stabilization (daily for the first 48 hours, then every other day through day 14):

- [ ] Review `operationalEvents` (via diagnostics panel) for `[maintenance.run.start]` events — confirms the background maintenance runtime (which enforces the outbox cap, per Module A) is actually running.
- [ ] Review for any `origin.baseline.recorded` / `origin.baseline.acknowledged` events — confirms the origin-identity check is behaving as expected, with no unexpected mismatches.
- [ ] Confirm no unresolved Sev1/Sev2 incidents are open past their escalation window (Part 4.3).
- [ ] Ask the doctor (briefly, not a formal form every single day) whether anything felt off since the last check-in.

### 7.2 Backup Verification

- [ ] Confirm the doctor has taken at least one manual backup in the last 7 days.
- [ ] Confirm the backup file is retrievable and, on a test/disposable instance, actually restores (per scenario 3.11) — a backup that cannot be restored is not a backup, it's an unverified assumption.
- [ ] Record backup file size and record counts against the previous check's numbers — a sudden drop in either is worth investigating before assuming it's benign.

### 7.3 Data Integrity Checks

- [ ] Spot-check row counts for `patients`, `consultations`, `appointments` against the last known-good count — flag any unexplained decrease immediately (Sev1 candidate).
- [ ] Run `runDexieHealthCheck` (existing diagnostics capability) if available in the build; note that it **detects**, it does not repair — a detected issue routes to Part 4 (Incident Management), not to an in-place fix attempt.
- [ ] Confirm no duplicate patient records have appeared (same name+phone combination) since the last check.

### 7.4 Performance Monitoring

- [ ] Ask the doctor directly whether any save felt slow or hung, even briefly — this is currently the only monitoring signal available (per the roadmap's Part 1.5 disclosure that remote monitoring does not exist yet in this release).
- [ ] If the background maintenance runtime's outbox-cap enforcement is ever observed to visibly slow down a save, treat this as a Sev2 incident immediately — `DOCTOR_OPERATIONAL_GUIDE.md` already flags this exact scenario as "worth reporting."

### 7.5 Browser Compatibility

- [ ] Confirm the doctor's device is on a current Chrome version (the app depends on `SpeechRecognition` and `IndexedDB`, both requiring a reasonably current browser, per `MODULE_A_RELEASE_CHECKLIST.md` §2).
- [ ] If the doctor's device auto-updates Chrome, note the version at each health check so a browser-update-correlated issue can be identified quickly if one appears.
- [ ] No other browser is currently supported or tested — if the doctor uses a second device/browser, that is out of scope for this release's support commitment and should be flagged, not silently assumed to work.

### 7.6 Recovery Procedures

Directly reuses the scenario table already published in `DOCTOR_OPERATIONAL_GUIDE.md` — this playbook's job is to make sure support staff execute it correctly, not to redefine it:

| If... | Recovery procedure |
|---|---|
| App won't open / blank screen | Do not clear browser data. Do not reinstall. Contact engineering with a screenshot first. |
| Origin-mismatch banner appears unexpectedly | Do not dismiss/acknowledge without confirming with engineering whether the origin change was planned. |
| Data appears missing after an update | Stop entering new data immediately. Do not attempt a restore without engineering present — preserve the ability to investigate first. |
| Device lost/reinstalled/replaced | Restore from the doctor's most recent manual backup, following scenario 3.11's procedure, on the replacement device. |

---

# PART 8 — GO / NO-GO CHECKLIST

Every item below is objectively verifiable — pass/fail against a stated method, not a subjective judgment call. This checklist is run at the end of Part 1.2 (Internal Verification) as the formal gate before Part 1.3 (Doctor Pilot) begins, and again at the end of Part 1.3 before Part 1.4 (Production Deployment).

| # | Category | Item | Verification method |
|---|---|---|---|
| 1 | Engineering | `tsc --noEmit` clean | Command output, exit 0 |
| 2 | Engineering | `npm run build` succeeds | Command output, `dist/` produced, PWA precache present |
| 3 | Engineering | Repository is clean (only the 13 intended Module A files differ from base commit; no CRLF noise) | `git diff --stat` output matches the expected file list |
| 4 | Engineering | Stale `.git/index.lock` cleared | `ls .git/index.lock` returns "no such file" |
| 5 | Testing | Full Vitest suite: 206/206 passed, 2 consecutive clean runs, run from native filesystem | Command output from both runs attached |
| 6 | Testing | `outboxCap.test.ts` tiebreaker flake fixed, or formally waived in writing with named owner | Fix commit reference, or signed waiver |
| 7 | Testing | All 13 scenarios in Part 3 executed and passed on the RC | Completed Part 3 checklist, dated, signed |
| 8 | Clinical | Doctor Pilot (Part 2) completed with Success Criteria (2.8) met | Signed pilot closure summary |
| 9 | Clinical | RVC-2 voice validation protocol completed and attached | Filled protocol document, not blank template |
| 10 | Clinical | Doctor's Day 5 pilot confidence rating is 4 or 5 | Daily Pilot Review Log, Day 5 |
| 11 | Security | No fake/placeholder authentication artifact present (e.g., a non-cryptographic "hash" printed as if it were a real signature) | Manual code/UI inspection confirms none present in this release's scope |
| 12 | Data | Migration (v49→v50) verified against a device with real pre-existing data, not only synthetic test data | Scenario 3.12 result on a real upgraded device |
| 13 | Data | Zero unexplained row-count discrepancies during Internal Verification or Pilot | Daily health check logs (Part 7.3) |
| 14 | Backup | Doctor has personally made and located a real backup on her real device | Scenario 3.10 result, doctor-confirmed |
| 15 | Backup | Restore verified end-to-end on a disposable/test instance | Scenario 3.11 result |
| 16 | Documentation | `DOCTOR_OPERATIONAL_GUIDE.md` reflects the actual current state of the release (no stale claims) | Manual diff/review against this release's actual behavior |
| 17 | Documentation | `MODULE_A_CERTIFICATION_REPORT.md` and `MODULE_A_TEST_REPORT.md` are the final, current versions referenced by this release | File timestamps/commit reference match the RC |
| 18 | Training | Doctor has been walked through the origin-mismatch banner and knows who to contact if it appears unexpectedly | Explicit confirmation in doctor's own words, logged |
| 19 | Training | Doctor understands there is no automatic off-device backup in this release | Explicit confirmation in doctor's own words, logged |

**Decision rule:** any single unchecked item in rows 1–15 (Engineering/Testing/Clinical/Security/Data/Backup) is an automatic **NO-GO** — these are not weighted or averaged. Rows 16–19 (Documentation/Training) may proceed with a named, dated commitment to close within 48 hours of deployment, but must not be silently dropped.

---

# PART 9 — MODULE A FREEZE

### 9.1 Pre-Freeze Cleanup (Prerequisite)

Before tagging anything, the repository must reach the state already identified as necessary in this project's own audit trail:

- [ ] The `outboxCap.test.ts` tiebreaker fix applied (recommended: stable secondary sort key in `enforceOutboxCap`'s fallback path) or formally waived per Part 8, item 6.
- [ ] Stale `.git/index.lock` deleted.
- [ ] All 13 real Module A changes staged and committed (`git add`, `git commit`) — the CRLF-noise cleanup already performed means `git status` should show only the intended file set once the lock is cleared.
- [ ] The 14 previously-untracked Module A files (origin-identity service/banner + their tests) added and committed.

### 9.2 Git Tagging & Release Branch

- **Release branch:** cut a `release/1.0` branch from `main` at the commit representing the cleaned-up Module A state (9.1). All hotfixes (Part 5.2) during Stabilization land on this branch first, then merge back to `main`.
- **Tag:** `v1.0.0` on the exact commit deployed as the RC (Part 1.1) — never move a tag after Production Deployment; a hotfix gets its own new tag (`v1.0.1`, etc.), not a retagged `v1.0.0`.
- **Tag message:** includes the RC evidence bundle reference (test report, build output) so the tag itself is self-documenting, not just a label.

### 9.3 Version Numbering

Semantic versioning, per the roadmap's existing recommendation (v2.0 Part 1.7): Module A's changes are additive, non-breaking data-layer hardening → `v1.0.0` for this release (treating this as the product's first formal production version, consistent with "Production Release 1.0" naming). Any hotfix increments the patch number (`v1.0.1`); the next planned module (Part 10) is a minor or major bump depending on whether it changes any existing behavior a doctor already depends on.

### 9.4 Artifacts

- `dist/` build output (the exact artifact deployed, retained, not rebuilt-on-demand later).
- RC evidence bundle (Part 1.1 deliverables).
- Completed Part 3 scenario checklist.
- Completed Part 8 Go/No-Go checklist, signed.
- `MODULE_A_CERTIFICATION_REPORT.md`, `MODULE_A_TEST_REPORT.md`, `MODULE_A_RELEASE_CHECKLIST.md` as they stood at tag time.

### 9.5 Deployment Package

The `dist/` artifact from 9.4, plus a short deployment manifest: commit hash, tag, build timestamp, target origin, deployer name, deployment date/time — the same fields the release plan (Part 1.4) requires logging, packaged together rather than scattered.

### 9.6 Release Notes

Doctor-facing, in the same plain tone as `DOCTOR_OPERATIONAL_GUIDE.md` — not a raw changelog:

```
Sakhi Clinic — Release 1.0 — [date]

What changed for you:
- Appointment double-booking is now prevented — if two bookings are
  attempted for the same slot at the same time, only one succeeds and
  you'll see a clear message.
- If a note fails to auto-save while you're working, you'll now see a
  clear signal instead of it failing silently.
- The app can now detect if it's ever running from an unexpected
  address and will warn you rather than silently showing a blank or
  wrong-looking app.

What did not change:
- Backups are still entirely your responsibility — see
  DOCTOR_OPERATIONAL_GUIDE.md. Automatic cloud backup is planned for a
  future release, not this one.

What to do:
- Nothing required. Open the app as usual; it prepares itself for the
  update automatically.
```

### 9.7 Rollback Package

Prepared *before* deployment, not improvised after an incident: the previous build's `dist/` artifact (or its exact commit hash, redeployable on demand), the deployment manifest for that previous build, and a one-line reminder of the rollback rule from Part 5.4 — code rollback only, never a manual schema downgrade.

---

# PART 10 — POST RELEASE PLAN

**This section states execution order only. It does not redesign any module — every module named below is already fully specified in `SAKHI_CLINIC_PRODUCTION_EXECUTION_ROADMAP_V2.md` Parts 3–9.**

### 10.1 Sequence

```
Production Release 1.0 (this package)
        │
        ▼
Module B — Authentication
        │
        ▼
Module C — Google Drive Backup & Restore
        │
        ▼
Existing Patient Import (Excel, extending the already-working CSV path)
        │
        ▼
Follow-Up Intelligence
        │
        ▼
Patient Dashboard
        │
        ▼
Rubric Engine
        │
        ▼
Clinical AI
```

### 10.2 Why This Sequence Minimizes Operational Risk

- **Release 1.0 must fully close (Part 1.6) before Module B begins.** Starting the next module's implementation before the current one has passed Stabilization would mean debugging two moving targets at once against a single doctor's live workflow — exactly the "scope creep across modules simultaneously" risk already named as High severity in `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` §9.

- **Authentication (Module B) before Drive Backup (Module C):** Drive sync is structurally meaningless without an identity to scope it to — a Drive folder, an OAuth grant, and a recovery-key association all require a signed-in identity to exist first. Building Drive integration before authentication would mean building it against a placeholder identity model, then reworking it once real auth lands — pure rework risk, avoided by strict ordering.

- **Drive Backup (Module C) before Patient Import:** Excel import is the one operation in this roadmap capable of writing many incorrect records to the live database in a single action if something goes wrong (a bad merge, a misread column mapping). Having automatic, versioned, off-device backup (Module C) in place *before* that capability ships means any import mistake is recoverable via a Drive-restored version, not dependent on the doctor having happened to take a fresh manual backup that specific day. This directly follows the roadmap's own dependency logic (v2.0 Part 4.1: "Module C has nothing to sync until Module B exists" — restated here as "Patient Import should not ship until Module C exists to protect against it").

- **Patient Import before Follow-Up Intelligence:** a doctor migrating historical patients benefits from having that data in the system before follow-up tracking becomes the daily-use surface — follow-up intelligence is most valuable once the patient base it's tracking is reasonably complete, not before.

- **Follow-Up Intelligence before Patient Dashboard:** the Patient Dashboard is explicitly a read-aggregation layer over data that Follow-Up Intelligence (among other modules) produces — building the dashboard first would mean either shipping an incomplete dashboard or building follow-up logic twice (once ad hoc for the dashboard, once properly for the dedicated module). Sequencing follow-up first means the dashboard is pure assembly, low-risk, by the time it's built — consistent with its Low effort/risk rating in the roadmap's own scoring (v2.0 Part 3.1).

- **Rubric Engine before Clinical AI:** the AI pipeline's rubric-suggestion stage is precisely the point in the roadmap's staged design (v2.0 Part 9.1) where an ungoverned suggestion becomes a real clinical-safety risk (the Risk Register's "AI hallucination" and "AI confidence mismatch" Critical items). Shipping the governance layer (doctor-approval-required rubric suggestions, confidence scoring, audit trail) before the full AI pipeline sits on top of it means the safety mechanism is proven under real use *before* it's asked to gate a more powerful, higher-stakes capability — never the other way around.

- **Clinical AI last, deliberately:** it is simultaneously the highest doctor-value module long-term and the module most capable of damaging doctor trust if rushed (v2.0 Part 3.1's own scoring: "High risk — this is the module most capable of doctor-trust damage if shipped before it's ready"). Every module before it in this sequence — auth, backup, import, follow-up, dashboard, rubric governance — exists in part to ensure that by the time Clinical AI ships, the doctor already trusts the system's data integrity and the AI's governance model, rather than being asked to trust both a new safety net and a new AI capability simultaneously.

### 10.3 What This Section Does Not Do

It does not estimate calendar time, does not restate each module's internal design (already complete in the roadmap), and does not authorize implementation of Module B or any subsequent module. Per this document's own stop condition, implementation of anything beyond Release 1.0 requires separate, explicit approval after this execution package itself is reviewed.

---

## Closing Note

This package is operational, not architectural — it assumes every design decision in the roadmap and certification documents is correct and focuses entirely on how to execute them safely with one real doctor and one real, currently-fragile patient dataset. No code has been written or modified in producing this document. Production Release 1.0 begins only after this package receives review and approval, per the stop condition below.

**STOP CONDITION: this package is complete. Implementation, deployment, or Module B work does not begin until this document is explicitly reviewed and approved.**
