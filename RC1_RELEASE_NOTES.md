# Sakhi Clinic — RC1 Release Notes

**Tag:** `v1.0.0-rc1`
**Commit:** `3914f643d8f32f170800ed24e757e65fe07417c3`
**Date:** 2026-08-03

This document describes the full RC1 release — everything shipped since the last planning freeze, not just the final certification pass. For the certification pass specifically (Playwright/quality-gate investigation and repair), see `RC1_CERTIFICATION_REPORT.md`.

**Evidence discipline:** every claim below is either **[MEASURED]** (a command was run, output quoted or described) or **[REASONED]** (derived from reading the code/commit history, not independently executed against a live device).

---

## New Features

**Backup & Restore subsystem** — a full redesign, not a patch: destination/mode/operations architecture (`refactor(backup)`, `feat(backup)` — 8 commits), structured `BackupJob` tracking with runtime-pluggable providers, a restore flow with a pre-restore safety snapshot, preview-before-restore validation, progress reporting, and a plain-language Backup Health Dashboard. Real periodic automatic-backup scheduling. **[MEASURED]** 8 backup-specific test files, 20+ test cases in `backupEngine.test.ts` alone, all passing (see Testing section).

**Google Drive cloud backup** — real PKCE OAuth integration via a Vercel serverless proxy, with the active provider restored from persisted OAuth state on every boot. Settings honestly reports "not yet configured for this deployment" when the one-time Google Cloud setup hasn't been done, rather than pretending to work.

**Follow-up Intelligence Dashboard** — a dedicated page (`FollowUpPage.tsx`) backed by a real intelligence service (`followUpIntelligenceService.ts`, `followUpEngine.ts`) that surfaces due/overdue follow-ups, with Completed/Cancelled statuses and a Cancel quick action. Cancelling a follow-up switches the doctor to that patient's tab for immediate context, rather than leaving them looking at an empty list.

**WhatsApp Reminder Intelligence Engine** — a reminders page and service layer (`RemindersPage.tsx`, `reminderQueueService.ts`, `reminderSchedulerService.ts`, `reminderDeliveryService.ts`, `reminderAnalyticsService.ts`, `reminderMaintenanceService.ts`) that queues, schedules, and tracks WhatsApp-based patient reminders. Reminder history now surfaces directly on the Patient Ledger, not just in a separate reminders list.

**Payment Tracking** — a Payment Tracker data model and service layer (`paymentService.ts`), payment recording directly in the consultation flow, a dedicated Payment Dashboard with deep-linked cards, and a corrected Patient Ledger that properly accounts for partial and waived payments (a real correctness fix, not just a UI addition — the ledger previously mis-totaled these cases).

**Action Dashboard** — a redesigned home dashboard with deep-linked filtered views (tap a card, land directly on the filtered list behind it), Pending Reminders and Pending Payments cards, and a Queue Intelligence panel.

**AI remedy approval gate** — explicit doctor-approval is now required before any AI-suggested remedy is treated as accepted; the app never lets AI output bypass review. A real clinical-safety guardrail, not a cosmetic confirmation dialog — enforced and tested (`consultationRubricApproval.test.tsx`).

**Mobile "Command Center" redesign** — the Today/Queue page on mobile viewports (<768px) was redesigned from a ported desktop panel into a purpose-built mobile UI: a "Now Serving" hero card, a floating add-walk-in button, and a horizontally-scrolling queue chip strip — not the same component resized, a genuinely different layout for the mobile context.

## Improvements

- Consultation mode now defaults intelligently: **Classic Mode** (full documentation) for first-visit patients, **Quick Mode** (streamlined, medicine-first) for follow-ups — a deliberate clinical-workflow decision, not a default that happened to be convenient.
- Bottom navigation now guarantees a minimum safe-area padding (`max(8px, env(safe-area-inset-bottom))`) instead of trusting `env()` alone, which silently resolves to 0px on most non-notched Android phones.
- The primary "Start next"/"Continue" call-to-action was moved back above the fold on mobile, ahead of the situational-awareness card grid, after the 9-card grid pushed it out of the first viewport.
- The command palette and bottom-nav were reconnected after becoming orphaned from their navigation handlers.
- `navigateTo()` in the app's own navigation is now viewport-agnostic, with real bottom-nav tap targets.
- The active page now persists across a same-tab refresh instead of resetting to the default.
- Dead `paymentSummary` state removed from the dashboard.

## Bug Fixes

- **Settings page blank-screen bug** — Settings was entirely unreachable due to a missing implementation; fixed and closed.
- **Android UUID compatibility / consultation runtime crash** — fixed a crash affecting Android consultation sessions.
- **Voice dictation**: Android duplicate-transcript bug (missing `sessionId` guard), overlapping non-disjoint final results not being stripped correctly, sentence-final punctuation being silently dropped, and retained-history normalization — a multi-commit hardening effort (7 commits) culminating in "finalize release candidate architecture."
- **OAuth token exchange**: the proxy was parsing Google's form-urlencoded response as JSON; explicit `.js` extensions were missing on relative imports, breaking Vercel's ESM loading; the serverless functions needed migration to Vercel's Web Handler signature; the client secret needed trimming (a trailing-whitespace bug) — six related fixes across one day of hardening, with temporary diagnostic probes added and then explicitly removed once root-caused (not left behind).
- **Auto-backup fallback** now reacts to a real save failure instead of a simulated one.
- **App-flow tests were leaking unhandled IndexedDB rejections** — fixed at the source, not suppressed.
- **`SettingsPage.tsx` unmount-safety bug** — diagnostics loader's `setState` calls were unguarded against the component having already unmounted, causing a hard crash in test environments and a harmless-but-noisy React warning in real browsers. Fixed in the most recent pre-RC1 commit.
- **25 false-positive Playwright failures** (this certification pass) — see `RC1_CERTIFICATION_REPORT.md` for full detail. Zero were product defects.

## Performance

**[MEASURED]**, from `rc1WorkflowPerf.test.ts`:
- `getDashboardActionData`: 383ms at 500 patients, 1465ms at 2000 patients — a 3.8x cost increase for a 4x data increase (sub-linear, not the disproportionate blow-up a naive implementation would show).
- Four workflow functions (`getPatientPaymentSummary`, `cancelFollowUp`, `getOutstandingPatients`, `getFollowUpBuckets`) proven to find/mutate the *correct* record among 2000 patients, not just to run fast — a correctness-at-scale check, not only a timing benchmark.

**[REASONED], unchanged and disclosed, not re-tested this pass:** these figures are against `fake-indexeddb` in a Node test environment, not real browser IndexedDB on real hardware — on-device performance at scale remains unverified.

## Backup & Restore

Covered in New Features above. Test coverage: **[MEASURED]** `backupEngine.test.ts` (20 tests), `backupRestoreFlow.test.ts` (8 tests: pre-restore snapshot, preview-without-restoring, confirm-after-preview, cancel-discards-preview, stale-token rejection, corrupted-checksum rejection, remote-provider preview/download failure), `backupSchedulerService.test.ts` (5 tests), plus `backupFormat.test.ts`, `backupJob.test.ts`, `backupProviderDispatch.test.ts`, `backupRetryAndVerification.test.ts`, `backupSettingsService.test.ts` — all passing.

**Disclosed limitation, unchanged:** no automatic off-device backup exists unless Google Drive has been specifically configured for the deployment. Until then, the doctor's manual "Download Backup" export is the entire backup system — see `DOCTOR_OPERATIONAL_GUIDE.md`.

## Testing

**[MEASURED]**, current state as of this release:
- TypeScript: clean (`tsc --noEmit`, exit 0).
- Unit/integration tests: **429/429 passing across 49 test files** (`vitest`), including dedicated coverage for follow-ups (`followUpsNavigation.test.tsx`, `followUpIntelligence.test.ts`), reminders (`remindersNavigation.test.tsx`, `reminderEngine.test.ts`), payments (`paymentService.test.ts`), dashboard (`dashboardActionService.test.ts`), and the AI-approval rubric (`consultationRubricApproval.test.tsx`).
- End-to-end (Playwright): **93/93 passing**, 24 pre-existing intentional desktop-only skips (Settings/Cloud Backup UI is deliberately `chromium`-only in current test coverage — the feature still works on mobile, only its automated regression coverage is desktop-scoped).
- Production build: succeeds, PWA service worker precache generates correctly (12 entries, 1732 KiB).

See `RC1_CERTIFICATION_REPORT.md` for the full investigation of what was previously a 25-failure Playwright run, and the evidence that none of those failures were product defects.

## Known Limitations

- No automatic off-device backup unless Google Drive has been specifically configured for the deployment.
- No disaster recovery for a lost, reset, or corrupted device — a manual backup file made beforehand is the only recovery path. This has not changed and is a larger, separate, not-yet-built project.
- Real-device performance at large patient counts (2000+) has been measured only against a simulated database in automated tests, not a real phone's browser storage.
- True offline (no-network) behavior has not been verified against a production build with an active service worker in this certification pass.
- The main JS bundle is 1.36 MB (418 KB gzipped) — functional, but a code-splitting effort would improve first-load time; not addressed in this release (out of scope: "no new functionality").
- Settings/Cloud Backup has automated regression coverage on desktop only; the feature works on mobile but that surface currently relies on manual verification.

## Upgrade Notes

- No database schema or migration changes in this release (this release did not touch the data layer certified separately in `MODULE_A_CERTIFICATION_REPORT.md`).
- No changes to backup file format — existing `sakhi.backup.v1` exports remain compatible.
- Before upgrading a live installation: take a manual backup export first (Settings → Download Backup), per standard practice for any update — not because this specific release is expected to cause problems.
- After upgrading: confirm the patient list and recent consultations still look correct; if anything looks wrong or missing, stop entering new data and investigate before continuing.
- See `RC1_PRODUCTION_READINESS_CHECKLIST.md` for the full deployment checklist and `RC1_DOCTOR_UAT_PACKAGE.md` for the doctor-facing acceptance walkthrough.
