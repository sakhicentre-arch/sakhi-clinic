# Sakhi Clinic — RC2 Vision & Backlog

**Status:** planning only. Nothing in this document is implemented, scheduled, or committed to. Per the RC1 feature freeze (`RC1_FREEZE.md`), none of this may be started before RC2 planning explicitly picks it up.

This backlog is grounded in the project's own history — `BETA_1.0_SCOPE_LOCK.md`'s deferred items, `RC1_FREEZE.md`'s disclosed known issues and technical debt, `VOICE_ARCHITECTURE_AUDIT.md`, `CONSULTATION_IMPLEMENTATION_AUDIT.md`, `MOBILE_DESIGN_BACKLOG.md`, and `PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md` — rather than invented fresh. Priority is P0 (do first in RC2) through P3 (nice to have, revisit later).

---

## AI

### Extend AI assistance beyond remedy suggestion
- **Problem:** AI involvement today is limited to remedy suggestions behind the doctor-approval gate (`0f0c9b9`). Chief-complaint summarization, case-note structuring, and follow-up-question prompting are all manual.
- **Benefit:** Reduces documentation time further, particularly in Classic Mode's fuller first-visit workflow.
- **Priority:** P2
- **Estimated complexity:** Large
- **Dependencies:** Must preserve the existing "AI never bypasses review" guarantee (`BETA_1.0_RISK_REGISTER.md`'s "AI hallucination"/"AI confidence mismatch" risks) — any expansion needs the same explicit-approval pattern already proven, not a new trust model.

### Confidence-aware AI presentation
- **Problem:** `BETA_1.0_RISK_REGISTER.md` flags "AI confidence mismatch" as a Critical-severity risk — low-confidence suggestions presented without visible confidence signal.
- **Benefit:** Prevents the doctor over-trusting a weak suggestion.
- **Priority:** P1
- **Estimated complexity:** Medium
- **Dependencies:** Requires the underlying AI service to actually expose a confidence score, which should be verified before scoping the UI work.

## Automation

### Automated off-device backup (beyond manual export)
- **Problem:** The single largest disclosed gap in RC1 — no automatic off-device backup unless Google Drive has been manually configured per deployment. The doctor is the entire backup system otherwise.
- **Benefit:** Directly closes the biggest disaster-recovery risk in the product.
- **Priority:** P0
- **Estimated complexity:** Large — this is "a separate, larger project" per `DOCTOR_OPERATIONAL_GUIDE.md`'s own framing, not a small addition to the existing Backup Engine.
- **Dependencies:** Builds on the already-shipped StorageProvider abstraction and Google Drive PKCE OAuth integration (RC1) — the plumbing exists; what's missing is making it the default rather than an opt-in per-deployment setup step.

### Automated reminder-to-outcome tracking
- **Problem:** The WhatsApp Reminder Intelligence Engine schedules and delivers reminders (RC1), but doesn't yet close the loop on whether a reminder led to an actual booked follow-up.
- **Benefit:** Turns reminders from a fire-and-forget notification into a measurable retention tool.
- **Priority:** P2
- **Estimated complexity:** Medium
- **Dependencies:** Reminder delivery/analytics services (RC1, shipped) and the Follow-up Intelligence Dashboard (RC1, shipped).

## WhatsApp

### Two-way WhatsApp (not just outbound share links)
- **Problem:** Current WhatsApp integration (`consultation-whatsapp-button`, reminder delivery) is outbound-only — opens a pre-filled message, doesn't receive or track patient responses.
- **Benefit:** Confirmations, reschedule requests, and patient questions could route back into the app instead of living only in the doctor's personal WhatsApp.
- **Priority:** P2
- **Estimated complexity:** Large — requires WhatsApp Business API integration, a real backend, and consent/compliance handling, not just a frontend change.
- **Dependencies:** A backend beyond the current serverless OAuth proxy; likely a new infrastructure decision, not an incremental extension.

### WhatsApp campaign/broadcast for recall lists
- **Problem:** No bulk-reminder capability for e.g. "all patients due for a 3-month follow-up this week."
- **Benefit:** Turns the existing Follow-up Intelligence Dashboard's data into proactive outreach instead of only reactive per-patient reminders.
- **Priority:** P3
- **Estimated complexity:** Medium
- **Dependencies:** Two-way WhatsApp (above) is not required first, but bulk sending raises its own rate-limit/consent questions worth scoping separately.
- **Note (post-Doctor-Workflow-Completion):** Generic Bulk Messaging shipped in the Doctor Workflow Completion phase, reusing `FilteredPatientList`'s selectable mode + `reminderQueueService`'s pending→approved→sent queue (`type: "custom"`). This item should be re-scoped at RC2 planning time to cover what's still missing on top of that (e.g. recall-list-specific targeting straight from Follow-up Intelligence buckets) rather than assumed to still be a from-scratch feature.

### Birthday Greeting Automation
- **Problem:** `Patient` currently has no date-of-birth field, only `age` (string|number) — a birthday-based greeting/reminder is impossible without one. Deliberately **not** added during Doctor Workflow Completion: DOB touches schema evolution, a migration/backfill strategy for existing patients, new UI, validation, and its own reminder logic — a properly-scoped feature in its own right, not a quick field addition.
- **Benefit:** Low-effort, high-goodwill patient touchpoint; a natural extension of the existing WhatsApp Productivity templates (Payment Receipt, Bulk Messaging) once the underlying data exists.
- **Priority:** P3
- **Estimated complexity:** Medium
- **Dependencies / requirements to design properly at RC2 scoping time:**
  - Optional `Patient.dateOfBirth` field (year may be unknown/unreliable for older patients — consider whether month+day alone should be a supported partial state)
  - Manual DOB entry UI (patient registration/edit form), not bulk-imported or inferred
  - Explicit handling for patients with unknown/unset DOB (must degrade gracefully, never block or nag)
  - A birthday reminder queue, most likely built on the existing `reminderQueueService` pending→approved→sent state machine (same pattern as follow-up reminders) rather than a new parallel mechanism
  - A dedicated WhatsApp birthday message template, following the `buildFollowUpMessage()`-style pure-function convention
  - Yearly recurrence/automation logic (this is the one part of WhatsApp Productivity explicitly scoped as manual-approve-only elsewhere — birthday timing may reasonably need its own automation-vs-approval decision)
  - Consent/privacy considerations before sending any unsolicited personal message (this is more personal than a clinical reminder and deserves its own opt-in/opt-out consideration, not an assumed extension of existing reminder consent)

## Clinical Intelligence

### Pattern alerts across visits (partially seeded, not complete)
- **Problem:** `QA_CHECKLIST.md` §7.2 already references "Pattern Alert" for 3+ visits with the same remedy as a planned/partial feature; current state of that specific capability wasn't independently re-verified in this pass and should be confirmed before RC2 scoping, not assumed complete or assumed absent.
- **Benefit:** Surfaces clinically relevant repetition the doctor might not consciously track across a busy patient list.
- **Priority:** P2
- **Estimated complexity:** Medium
- **Dependencies:** Consultation history data model (already in place).

### Timeline redesign
- **Problem:** Deferred since `BETA_1.0_SCOPE_LOCK.md` (originally "Beta 1.1"); still not delivered in RC1.
- **Benefit:** Patient history is a core clinical reference; the current timeline is functional but was explicitly scoped as secondary to the consultation core.
- **Priority:** P1
- **Estimated complexity:** Medium
- **Dependencies:** None blocking — this was deferred by choice, not by a technical prerequisite.

## Analytics

### Large-scale analytics/reporting redesign
- **Problem:** Explicitly out of scope since `BETA_1.0_SCOPE_LOCK.md` ("Large-scale analytics and reporting redesign" — Non-goal for Beta 1.0). RC1 shipped a Payment Dashboard and Action Dashboard, but no cross-cutting analytics layer.
- **Benefit:** Aggregate trends (patient volume, remedy frequency, outcome rates) would support practice-level decisions, not just per-patient/per-day views.
- **Priority:** P2
- **Estimated complexity:** Large
- **Dependencies:** Real-device performance validation (Infrastructure, below) should happen first — an analytics layer scanning the full patient/consultation history is exactly the workload that would surface any IndexedDB scaling issue at 2000+ patients.

## Practice Management

### Multi-doctor / multi-clinic-branch permissions
- **Problem:** Current architecture assumes a single doctor's data; `activeClinic` exists as a filter (seen in queue/dashboard code) but there's no evidence of per-user access control.
- **Benefit:** Needed for any clinic with more than one practitioner or receptionist-level staff.
- **Priority:** P3
- **Estimated complexity:** Large — likely requires an auth model that doesn't exist today.
- **Dependencies:** None shipped yet to build on; this is a from-scratch architecture decision.

### Patient import/migration tooling
- **Problem:** Deferred since `BETA_1.0_SCOPE_LOCK.md` ("Future Release"). Doctors switching from paper records or another system have no bulk-import path.
- **Benefit:** Removes the single biggest onboarding friction for a new deployment.
- **Priority:** P1
- **Estimated complexity:** Medium
- **Dependencies:** A defined, validated import format and the same duplicate-detection logic already proven for manual patient entry (`BETA_1.0_RISK_REGISTER.md`'s "Duplicate patient" risk).

## Accounting

### Export payment data for external accounting
- **Problem:** Payment Tracking (RC1) records fees, outstanding, and waived amounts, but there's no evidence of an export path for a doctor's actual accountant/tax filing.
- **Benefit:** Avoids the doctor manually re-entering financial data elsewhere.
- **Priority:** P2
- **Estimated complexity:** Small — likely a CSV/PDF export of existing `paymentService.ts` data, not new data modeling.
- **Dependencies:** None blocking; builds directly on RC1's shipped payment data model.

## Reporting

### Doctor-facing periodic summary (e.g. weekly digest)
- **Problem:** All current reporting is on-demand (Dashboard, Payment Dashboard) — nothing proactively surfaces a "here's your week" summary.
- **Benefit:** Matches the WhatsApp-reminder pattern already established for patients, applied to the doctor's own practice awareness.
- **Priority:** P3
- **Estimated complexity:** Medium
- **Dependencies:** Reminder scheduling infrastructure (RC1, shipped) could plausibly be reused for delivery.

## Integrations

### WhatsApp Business API (see WhatsApp section)
- Cross-referenced above; listed here for completeness since it's as much an integration decision as a feature one.

### Real Google Drive production hardening beyond current scope
- **Problem:** `docs/GOOGLE_DRIVE_PRODUCTION_VALIDATION_REPORT.md` exists and Google Drive sync shipped in RC1, but real-world multi-device conflict handling (two devices both syncing to the same Drive folder) wasn't a focus of this certification pass.
- **Benefit:** Prevents silent data conflicts for doctors using the app on both a phone and a laptop.
- **Priority:** P1
- **Estimated complexity:** Medium
- **Dependencies:** `docs/GOOGLE_DRIVE_PRODUCTION_VALIDATION_REPORT.md` should be re-read in full before scoping — it may already document known conflict-handling gaps.

## Infrastructure

### Automatic off-device backup
- Cross-referenced under Automation (P0) — the single highest-priority item in this entire document.

### Real-device performance validation at scale
- **Problem:** All 2000-patient performance figures in RC1 are measured against `fake-indexeddb` in Node, not real browser IndexedDB on a real Android device — disclosed, unresolved gap carried from Module A through RC1.
- **Benefit:** Converts an assumption into a measured fact before a doctor with a large, multi-year patient list hits it first.
- **Priority:** P0
- **Estimated complexity:** Small (measurement only, not a code change) — but requires actual device access, which is an operational dependency, not an engineering one.
- **Dependencies:** A real Android device (or real Chrome desktop, at minimum, as an interim signal) and an anonymized large dataset — `MODULE_A_CERTIFICATION_REPORT.md` already proposed the anonymization procedure.

### True offline/service-worker verification
- **Problem:** Offline behavior has only ever been tested against a dev server with no active service worker — never against a real production build.
- **Benefit:** The app's PWA framing implies offline-first; this has never actually been confirmed true.
- **Priority:** P0
- **Estimated complexity:** Small (a production build + manual airplane-mode test, not new code)
- **Dependencies:** None — could be done immediately, doesn't require RC2 development at all, just hasn't been done yet.

### Voice architecture: single-manager recognition model
- **Problem:** `VOICE_ARCHITECTURE_AUDIT.md` documented an "N-Instance Uncoordinated" model as the as-audited architecture, with a "Required Model: Single Manager" recommendation. Subsequent voice-hardening commits (7 commits culminating in `05b7c4b`) addressed specific symptoms (duplicate transcripts, overlap handling) but it's not confirmed whether the underlying N-instance architecture itself was restructured or just hardened around.
- **Benefit:** Structural fix vs. continued symptom-patching for future voice bugs.
- **Priority:** P1
- **Estimated complexity:** Large
- **Dependencies:** Should start with re-reading `VOICE_ARCHITECTURE_AUDIT.md` against current code to confirm what's actually still true post-hardening, not assumed unchanged.

## Performance

### Code-splitting the main bundle
- **Problem:** Main JS chunk is 1.36 MB (418 KB gzipped) — functional but not optimized.
- **Benefit:** Faster first load, especially relevant on the lower-end Android devices this app's doctor persona actually uses.
- **Priority:** P1
- **Estimated complexity:** Medium
- **Dependencies:** None blocking; standard `build.rollupOptions.output.manualChunks` or route-based `dynamic import()` work.

### `ConsultationPage.tsx` decomposition
- **Problem:** 3600+ lines in one file, documented in `CONSULTATION_IMPLEMENTATION_AUDIT.md` as desktop-first architecture adapted to mobile rather than redesigned. Both Quick-mode and Classic-mode render trees live in the same file.
- **Benefit:** Reduces risk of exactly the kind of subtle cross-mode bug this certification pass spent significant effort tracing (e.g., a testid present in one mode's render tree but not the other).
- **Priority:** P1
- **Estimated complexity:** Large — this is a structural refactor of the single most complex page in the app, not a quick win.
- **Dependencies:** Full regression test coverage should be confirmed stable first (it now is, per RC1 certification) before undertaking a refactor of this size.

## UX

### Fresh pass over `MOBILE_DESIGN_BACKLOG.md`'s 27 tracked issues
- **Problem:** That backlog predates much of RC1's mobile redesign work (Command Center, safe-area padding, bottom-nav fixes) — its current accuracy is unverified.
- **Benefit:** Either confirms real remaining UX debt worth scheduling, or lets the team retire a stale document instead of carrying unverified claims forward indefinitely.
- **Priority:** P1
- **Estimated complexity:** Small (audit only)
- **Dependencies:** None — could be done as the very first RC2 planning activity.

### Documentation: mobile testid namespace and mode-default behavior
- **Problem:** Identified directly in this certification pass — the mobile UI's divergent testid namespace and the Quick/Classic mode-default behavior aren't written up anywhere durable, which is exactly what caused 25 false-positive Playwright failures.
- **Benefit:** Prevents the same class of false-positive/false-assumption bug recurring in future test-writing.
- **Priority:** P0
- **Estimated complexity:** Small — a short section in `TESTING_GUIDE.md`.
- **Dependencies:** None — purely a documentation task, could be done immediately.
