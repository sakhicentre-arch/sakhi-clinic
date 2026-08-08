# Follow-up Date Bug Fix — Investigation & Fix Report

Branch: `feature/fix-followup-date-calculation`, created off `doctor-uat`'s HEAD (`492e0f4`). Not merged, not pushed. No commits were made — this report describes a verified, working fix on disk, per your explicit "do not commit or push" instruction.

## 1. Doctor-reported issue

Today: 08/08/2026. A consultation was created dated 08/08/2026 with a next follow-up of 10/08/2026. The patient immediately appeared under **"Overdue Follow-up"** and **"Missed Patient"**, and the displayed follow-up date showed **01/08/2026** instead of 10/08/2026.

## 2. Exact reproduction

Reproduced deterministically (no guessing) in `src/__tests__/integration/followUpDateBugFix.test.ts`, "proves the OLD bug mechanism is fixed" test: seeding a patient/consultation with `nextFollowUpDate = "2026-08-09T18:30:00.000Z"` (see §4 for exactly where this value comes from) and feeding it through the app's real `parseDateOnly()` reproduces `getDate() === 1` before the fix — the doctor's exact symptom, byte-for-byte.

## 3. Root cause

Two independent defects compounded:

**Defect A — malformed value at the source.** `ConsultationPage.tsx`'s "Next follow-up" field was `<input type="datetime-local">` (both the mobile "Schedule & billing" panel and the desktop Classic-mode footer), while every other date-only field in the domain layer (`Patient.nextFollowUpDate`, `Consultation.followUpDate`) is documented and consumed as a bare `"YYYY-MM-DD"` string. The save path then did `new Date(formData.formFollowUpDate).toISOString()`. A `datetime-local` value with no explicit offset (e.g. `"2026-08-10T00:00"`) parses as **local time**; for a doctor in a timezone ahead of UTC (IST, UTC+5:30), that becomes `"2026-08-09T18:30:00.000Z"` in UTC — a full ISO datetime string, not the bare date the rest of the app expects.

**Defect B — silent corruption on read.** `dateOnly.ts`'s `parseDateOnly()`, the app's single documented canonical parser for these fields, assumed its input was always a bare date and did `dateOnly.split("-").map(Number)` with no validation. Fed the malformed string above, `Number("09T18:30:00.000Z")` (the trailing chunk after the second `-`) evaluates to `NaN`, and the fallback `d || 1` silently substituted day **1**.

## 4. Why 01/08/2026 appeared

Full trace, stage by stage:

| Stage | Value | Where |
|---|---|---|
| User input | doctor picks "10 Aug 2026" via `<input type="datetime-local">` | `ConsultationPage.tsx` (pre-fix) |
| Form state | `"2026-08-10T00:00"` (no offset) | `formData.formFollowUpDate` |
| Consultation object | `new Date("2026-08-10T00:00").toISOString()` → **`"2026-08-09T18:30:00.000Z"`** (local→UTC shift, IST) | `ConsultationPage.tsx` save handler (pre-fix) |
| Database (consultation) | `"2026-08-09T18:30:00.000Z"` written verbatim | `Consultation.followUpDate` |
| Propagation to patient | copied unchanged, zero normalization | `patientService.ts`'s `syncPatientFollowUp()` |
| Database (patient) | `"2026-08-09T18:30:00.000Z"` | `Patient.nextFollowUpDate` |
| Follow-up calculation | `parseDateOnly("2026-08-09T18:30:00.000Z")` → `split("-")` → `["2026","08","09T18:30:00.000Z"]` → `Number(...)` → `NaN` → `d || 1` → **day = 1** | `dateOnly.ts` (pre-fix) |
| Classification | `getFollowUpBuckets()`/`getFollowUpHistory()` compare "1 Aug" against "8 Aug" → in the past | `followUpIntelligenceService.ts` |
| UI display | `dashboardActionService.ts` formats the *parsed* (corrupted) date directly into the alert text: `` `Missed follow-up advised for ${parseDateOnly(h.followUpDate).toLocaleDateString(...)}` `` → **"1 Aug"** | `dashboardActionService.ts:103` (Dashboard's "Missed Patients" card) |

**"10/08/2026 became 01/08/2026 at `dateOnly.ts`'s `parseDateOnly()`, because it received a full ISO datetime string (produced by `ConsultationPage.tsx`'s `datetime-local` input round-tripped through `new Date(...).toISOString()`) instead of the bare date it expected, and its `.split("-").map(Number)` parsing silently turned the corrupted day component into `NaN`, which the `d || 1` fallback replaced with the 1st of the month."**

## 5. Why 10/08/2026 was incorrectly classified

Once `parseDateOnly` produced "1 Aug" instead of "10 Aug", every downstream comparison against "today" (8 Aug) correctly followed its own logic on a corrupted input: 1 Aug < 8 Aug, so:
- `getFollowUpBuckets()` (drives the Dashboard's **"Overdue Follow-ups"** card and `FollowUpPage.tsx`'s "Overdue" tab) placed the patient in `overdue`.
- `getFollowUpHistory()` (drives the Dashboard's **"Missed Patients"** card) found no later visit before "1 Aug" and marked the follow-up `missed`.

Both classifiers were behaving correctly given their input; the input itself was wrong.

## 6. Business rule (documented, not invented)

Two distinct, intentional data points exist for follow-ups (confirmed via `followUpIntelligenceService.ts`'s own header comment — not a bug to "fix away"):
- **`Patient.nextFollowUpDate`** — the current single follow-up date, re-derived by `syncPatientFollowUp()` after every consultation save. Drives real-time bucketing: **Overdue** (due date < today), **Due Today**, **Tomorrow**, **Upcoming** (within 7 days).
- **`Consultation.followUpDate`** — the per-visit historical record. Drives **Missed** (due date passed with no later visit) vs. **Completed** (a later visit occurred on/after it) vs. **Pending** (due date not yet reached).

**A follow-up due in the future must never be Overdue or Missed** — this is the rule both classifiers already implement; the bug was corrupting the date they compared against, not the comparison logic itself. No new source of truth was introduced; `FollowUpPage.tsx` already reads from the correct canonical functions.

## 7. Code changes

All changes converge on one principle (your Step 8's own instruction): make `followUpDate`/`nextFollowUpDate` a bare `"YYYY-MM-DD"` string everywhere, and defend the canonical parser against ever seeing anything else.

- **`src/pages/ConsultationPage.tsx`** — the two follow-up date inputs (mobile "Schedule & billing" panel, desktop Classic-mode footer) changed from `type="datetime-local"` to `type="date"`, matching the pattern the existing "Quick intervals" custom-date picker already used correctly. The three places that constructed a consultation/print/WhatsApp-preview object stopped round-tripping the value through `new Date(...).toISOString()` — it's stored/used as-is now. Two display-only date-to-text conversions (WhatsApp share note, mobile stage summary chip) switched from raw `new Date()` to `parseDateOnly()`. The "FU:" pill on the recent-visit metadata row (a separate, previously undiscovered overdue-styling site using raw `new Date(...).getTime() < Date.now()`) now uses `parseDateOnly` + `startOfDay` comparison, consistent with the rest of the app. The edit-load path (`consultationToForm`) now slices to 10 chars instead of 16, matching the new `type="date"` input (and gracefully degrading any already-corrupted historical row to just its date portion instead of being silently rejected by the browser).
- **`src/utils/dateOnly.ts`** — `parseDateOnly()` now checks input length; anything longer than a bare date (10 chars) is handed to `new Date(...)` directly (which parses a full ISO string correctly on its own) instead of being split and corrupted. This is a defensive backstop for any already-corrupted historical data or any future caller that accidentally passes the wrong format — it does not change behavior for any correctly-formatted bare date (confirmed by the pre-existing `dateOnly.test.ts` suite still passing unchanged).
- **`src/services/followupEngine.ts`** — `getFollowUpAlerts()` (feeds the Dashboard's "Intelligent Alerts" and its own independent OVERDUE/DUE classification) was calling `new Date(patient.nextFollowUpDate)` directly, bypassing the canonical parser entirely — a second, disagreeing overdue calculation for the same field. Now uses `parseDateOnly()`, so this engine and `followUpIntelligenceService.ts` can no longer disagree about the same patient.
- **`src/pages/FollowUpPage.tsx`** — its own `formatDate()` (used for every date the Follow-ups page shows the doctor) did `new Date(iso).toLocaleDateString(...)` directly. For a bare date-only string this parses as UTC midnight; found during E2E verification to render one day off in this environment's timezone (would affect any doctor in a timezone behind UTC, independent of the original IST bug). Fixed to branch on string length exactly like `dateOnly.ts`'s own `isSameLocalDay`/`isSameLocalMonth` already do.
- **`src/components/PrintableConsultation.tsx`** — same defect, same fix, in the printed prescription's `formatDate()` (used for the printed "Next Appointment" line).

## 8. Files changed

| File | Type |
|---|---|
| `src/pages/ConsultationPage.tsx` | Modified |
| `src/utils/dateOnly.ts` | Modified |
| `src/services/followupEngine.ts` | Modified |
| `src/pages/FollowUpPage.tsx` | Modified |
| `src/components/PrintableConsultation.tsx` | Modified |
| `src/__tests__/integration/dateOnly.test.ts` | Modified (tests added) |
| `src/__tests__/integration/followUpDateBugFix.test.ts` | New (20 tests) |
| `tests/followup-date-fix.spec.ts` | New (2 E2E tests × 5 projects) |

**Explicitly not touched:** `src/services/sync/`, `src/components/sync/`, any Sync Phase 2/3 test file, `paymentService.ts`, `RecordLaterPaymentFlow.tsx`, `RevenuePage.tsx`, `PatientPage.tsx`, OAuth/backup files — all pre-existing uncommitted work from before this task, confirmed unmodified by `git status`/`git diff`.

## 9. Tests added

- **Unit** (`dateOnly.test.ts`, +3 tests): `parseDateOnly` no longer collapses a full-ISO input to day 1; parses it as the correct explicit instant; still parses a bare date exactly as before (no regression).
- **Integration** (`followUpDateBugFix.test.ts`, 20 tests, against real fake-indexeddb through the actual `saveConsultation()`/`syncPatientFollowUp()`/`getFollowUpBuckets()`/`getFollowUpHistory()`/`getFollowUpAlerts()` write-and-read path):
  - Deterministic reproduction of the doctor's exact scenario (today=08/08/2026, consultation=08/08/2026, follow-up=10/08/2026): verifies the value persists verbatim on both the consultation and the patient record, is bucketed `upcoming7` (not `overdue`), is classified `pending` (not `missed`), and that `followupEngine.ts`'s independent alert source agrees.
  - Direct proof the old malformed-value mechanism no longer produces day 1.
  - Full date matrix, Cases A–I (due today / tomorrow / +2 days / yesterday / 30 days ago / month boundary / year boundary / leap year / midnight-boundary stability).
  - Historical cross-date regression matrix (7 rows, table-driven).
  - Cross-engine agreement tests: `followupEngine.ts` and `followUpIntelligenceService.ts` now agree on both a future date (not overdue) and a past date (overdue) for the same patient.
- **E2E** (`tests/followup-date-fix.spec.ts`, runs on all 5 Playwright projects — desktop chromium + 4 mobile viewports, since the bug involved both the desktop Classic-mode and mobile Quick-mode inputs): uses Playwright's `page.clock` to fix "today" to the doctor's exact reported date, 08/08/2026.
  - Registers a synthetic patient, starts a real consultation, sets the follow-up date to 10/08/2026 through the actual (now-fixed) UI input, saves, then verifies: not listed under `FollowUpPage`'s "Overdue" tab; listed under "Upcoming" showing the correct day and month (locale-order-agnostic assertion) with the old bug's "01" text confirmed absent; not listed under the Dashboard's "Overdue Follow-ups" or "Missed Patients" cards.
  - Positive case: a follow-up genuinely allowed to lapse (scheduled while still in the future, then the clock advanced past it) is correctly shown as overdue with the correct day count — proving the fix doesn't suppress real overdue detection.

## 10. Full regression results

- `npx tsc --noEmit`: **clean, 0 errors.**
- `npx vitest run` (full suite): **95 files / 718 tests, all passing** (baseline before this task: 94 files / 695 tests — +1 file, +23 tests, 0 regressions).
- `npm run build`: **succeeds**; only the pre-existing, unrelated chunk-size/dynamic-import warnings (same ones present before this change).
- `npx playwright test` (full suite, all 5 projects): **105 passed, 2 flaky, 24 skipped, 0 hard failures.** The 2 flaky tests (`duplicate-appointment-slot.spec.ts`, `tests/mobile/record-later-payment.spec.ts`) are pre-existing, unrelated tests that failed on an assertion earlier than anything this task touched (chief-complaint field visibility, appointment-slot timing) and passed on retry — not caused by this change (verified by reading the actual failure diffs, not assumed).
- `tests/followup-date-fix.spec.ts` targeted, all 5 projects: **10/10 passed on first try, zero retries** (chromium, pixel5, small-android-360x800, small-android-390x844, small-android-412x915).

## 11. Cross-surface verification

| Surface | Verified via | Result |
|---|---|---|
| FollowUpPage "Overdue" tab | E2E | Patient absent |
| FollowUpPage "Upcoming" tab | E2E | Patient present, correct date shown, "01 Aug" confirmed absent |
| Dashboard "Overdue Follow-ups" card | E2E | Patient absent |
| Dashboard "Missed Patients" card | E2E | Patient absent |
| Dashboard "Overdue Follow-ups" card (positive case) | E2E | Genuinely-overdue patient present with correct day count |
| `followupEngine.ts`'s alert source (feeds Dashboard "Intelligent Alerts") | Integration test | Agrees with `followUpIntelligenceService.ts` on both the future and the past case |
| Consultation page's own "FU:" recent-visit pill | Code fix (same defect class found and fixed; no dedicated new test — low-risk, same proven pattern) | Fixed |
| Printed prescription's "Next Appointment" line | Code fix (same defect class found and fixed; no dedicated new test — component has no pre-existing test harness) | Fixed |
| WhatsApp reminder/follow-up note text | Code fix (`ConsultationPage.tsx`'s own share-note builder) | Fixed |

Reminders, scheduling, appointment creation, and existing payment/backup features were not touched and are unaffected — confirmed by the full regression suite (§10) showing zero new failures anywhere outside this change's own scope.

## 12. Before/after behavior

| Scenario | Before | After |
|---|---|---|
| Consultation today, follow-up 2 days out | Stored as full-ISO, shifted date; classified Overdue/Missed; displayed "01 Aug" | Stored as `"2026-08-10"` verbatim; classified Upcoming/Pending; displays "10 Aug" |
| Consultation today, follow-up genuinely in the past (scheduled earlier, now lapsed) | Correctly Overdue (this direction happened to work before, since `followupEngine.ts`'s raw `new Date()` parses a full-ISO string correctly) | Still correctly Overdue |
| `followupEngine.ts` vs. `followUpIntelligenceService.ts` for the same patient | Could disagree (one used raw `new Date()`, the other the buggy `parseDateOnly`) | Always agree (both use the same hardened `parseDateOnly`) |

## 13. Known limitations

- **Not fixed (out of scope, does not reproduce the reported bug):** `TodayPage.tsx` has its own separate, pre-existing date module (`todayStr`/`fmtDate`/`daysAgo`) that never imports `dateOnly.ts`, and `useClinicalInsights.ts` / `DashboardPage.tsx` (line ~301) call `new Date()` directly on `nextFollowUpDate` in a couple of spots. Verified these do **not** manifest the doctor's reported symptom for the exact malformed value in question (string comparison and raw ISO parsing both happened to survive it), so per your explicit "no unrelated refactoring" instruction they were left alone. Worth a dedicated follow-up pass at some point for full consistency, not blocking this fix.
- Any **already-corrupted historical data** (a follow-up date saved before this fix, in the old full-ISO format) will now be parsed correctly-ish by the hardened `parseDateOnly` (via `new Date(fullIsoString)`) rather than catastrophically as day 1, but its date may still be off by up to one day from what the doctor originally intended, since the original local-time information was lost at write time and cannot be recovered after the fact. No historical data migration was performed (none was requested, and guessing at doctors' original intent would be worse than leaving it as-is).
- No dedicated new unit test was added for `PrintableConsultation.tsx`'s fix or `ConsultationPage.tsx`'s "FU:" pill fix — both changes are the exact same one-line pattern already proven correct in `dateOnly.test.ts`/`followUpDateBugFix.test.ts`, and neither component had pre-existing test infrastructure to extend without disproportionate new scaffolding.

## 14. Final verdict

**READY FOR DOCTOR UAT**

Root cause fully traced to two exact lines of code, fixed at the smallest correct layer (the follow-up date input's type, the save path's unnecessary round-trip, and the canonical parser's missing input guard), with the same defect class found and fixed consistently everywhere it appeared. All quality gates pass (tsc clean, 718/718 unit+integration tests, build succeeds, 105/105+2-pre-existing-flaky/24-skipped E2E, and 10/10 on the new targeted regression test across every viewport). No Sync, payment, OAuth, or backup code was touched. No commits or pushes were made.
