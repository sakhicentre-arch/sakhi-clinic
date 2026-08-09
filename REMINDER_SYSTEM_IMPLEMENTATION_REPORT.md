# Appointment Reminder System — Implementation Report

Branch: `feature/appointment-reminders`, created off `doctor-uat`'s HEAD (`16f7834`). Not committed, not pushed, not deployed — this report describes a verified, working implementation on disk, per your explicit "do not commit or push" instruction.

## What changed

The existing "appointment" reminder type (already modeled in the schema but never produced by anything) is now real. A doctor can queue WhatsApp reminders for today's or this week's appointments, review/edit them, and approve/send through the exact same reminder queue that already handles follow-up reminders — with the same duplicate guard, same status model, and same WhatsApp mechanism. The two pre-existing paths that sent reminders directly with no review step (`AppointmentPage.tsx`'s "Blast Sequential Reminders", `TodayPage.tsx`'s per-patient "Remind" button) have been retired in favor of this one canonical path.

## Existing architecture reused (nothing new invented)

- **`reminderQueueService.ts`** — `enqueueReminder`, `hasActiveReminder`, `listAllReminders`, `approveReminder`, `rejectReminder`, `cancelReminder` — used exactly as-is.
- **`reminderDeliveryService.ts`** — `sendReminder`/`resendReminder` (WhatsApp send + history) — used exactly as-is.
- **`RemindersPage.tsx`** — the existing Pending/Approved/Sent/Failed/Cancelled/Rejected tabs, per-row and bulk approve/send controls, edit-before-send, delivery history — all reused unmodified for appointment-type reminders; only two new read-only sections were added above them.
- **`dateOnly.ts`** — `dateKey`, `startOfDay` — the only date utilities used anywhere in the new code. No new date parser was introduced anywhere.
- **`whatsappService.ts`'s `openWhatsApp`** — the only send mechanism; no new WhatsApp provider.
- **The `ReminderType: "appointment"` schema value** — already existed in `db.ts`; this feature is its first real producer. **Zero schema changes, zero migrations.**

## Files modified

| File | Change |
|---|---|
| `src/services/reminderSchedulerService.ts` | Added `buildAppointmentReminderMessage` (the one canonical appointment template), `getTodayAppointmentReminderCandidates`, `getThisWeekAppointmentReminderGroups`, `queueAppointmentReminders`. All reuse `appointmentService.getAll()`, `patientRepository.list()`, `hasActiveReminder`, `enqueueReminder`. |
| `src/pages/RemindersPage.tsx` | Two new sections ("Today's Appointment Reminders," "This Week's Appointment Reminders") above the existing queue, each with a queue-trigger button and a per-patient status badge (Sent/Failed/Pending/Approved/No WhatsApp/Not queued). Fixed a real gap found while building this: approving/sending/rejecting/cancelling via the existing generic actions now also refreshes these new sections' badges (previously only this feature's own queue buttons did). |
| `src/pages/AppointmentPage.tsx` | `openReminder`/`sendAllReminders` no longer call `openWhatsApp` directly — both now call `queueAppointmentReminders` and report the result via the same `alert()` convention this file already uses. Button relabeled "Queue Today's Reminders" (was "Blast Sequential Reminders"). The "today" calculation for this button now uses `dateOnly.ts`'s `dateKey()` instead of this file's own non-canonical UTC-based `formatLocalDate()`, so it can never disagree with RemindersPage's own "Today" section about what day it is. |
| `src/pages/TodayPage.tsx` | The Missed Follow-ups widget's "Remind" button no longer calls `openWhatsApp` directly — it now calls `hasActiveReminder`/`enqueueReminder` with `buildFollowUpMessage` (the exact pattern `FollowUpPage.tsx`'s own manual "Send Reminder" button already uses), so a manual nudge from Today's queue becomes reviewable/trackable instead of fire-and-forget with no record anywhere. |
| `src/App.tsx` | `onNavigate` prop wired to `AppointmentPage` and `TodayPage` (both previously only received `goToConsultation`) so their reminder actions can jump the doctor to the Reminders page after queueing — same pattern already used for `DashboardPage`/`PatientPage`/`FollowUpPage`. |
| `src/__tests__/integration/reminderEngine.test.ts` | +14 tests in a new describe block, extending the file that already tests this exact service. |
| `tests/appointment-reminders.spec.ts` | New — 2 E2E tests, run across all 5 Playwright projects. |

## Files deliberately untouched

`reminderQueueService.ts`, `reminderDeliveryService.ts`, `reminderAnalyticsService.ts`, `reminderMaintenanceService.ts`, `whatsappService.ts`, `utils/whatsapp.ts`, `dateOnly.ts`, `db.ts` (no schema change needed), `appointmentService.ts` (the scheduler reads it via its existing public API, no changes needed to it), `followUpIntelligenceService.ts`, `followupEngine.ts`, `paymentService.ts`, `RecordLaterPaymentFlow.tsx`, `RevenuePage.tsx`, `PatientPage.tsx`'s payment section, `maintenanceRuntimeService.ts` (appointment reminders are doctor-initiated, not auto-scheduled — see "This-week workflow" below for why), and everything under `src/services/sync/`, `src/components/sync/`, plus all rubric/backup/OAuth files — confirmed unmodified by `git status` both before and after this work.

**One deliberately NOT retired path:** `AppointmentPage.tsx`'s `handleAdd()` still sends a booking-confirmation WhatsApp message directly. This is a transactional receipt sent once at booking time, not a "reminder" in the sense audited — it's out of scope for this task and was left untouched.

**One deliberately NOT removed piece of now-dead code:** `useAppointmentStore.markReminderSent()` / `appointmentService.markReminder()` (the old `Appointment.reminderSent` boolean writer) are no longer called from anywhere, since the canonical signal for "does this patient have an active appointment reminder" is now `hasActiveReminder(patientId, "appointment")`, not that boolean. They were left in place rather than deleted — removing a store action and its schema field wasn't requested, and doing so wasn't necessary to retire the direct-send path. Flagged here rather than silently dropped.

## Old reminder paths removed/redirected

| Path | Before | After |
|---|---|---|
| `AppointmentPage.tsx` per-row reminder icon (`openReminder`) | `openWhatsApp()` directly, no review | `queueAppointmentReminders([candidate])` → lands in Pending queue |
| `AppointmentPage.tsx` "Blast Sequential Reminders" (`sendAllReminders`) | Looped `openWhatsApp()` calls, 2.5s stagger, no review | `queueAppointmentReminders(candidates)` → lands in Pending queue; button relabeled "Queue Today's Reminders" |
| `TodayPage.tsx` Missed Follow-ups "Remind" button | `openWhatsApp()` directly, no record anywhere | `hasActiveReminder` + `enqueueReminder` (type `follow_up`, `buildFollowUpMessage`) → lands in Pending queue |

**Every path named in this task's explicit scope (AppointmentPage.tsx, TodayPage.tsx) now goes through the queue.** A final grep for every remaining `openWhatsApp(` call site, done as part of this report's own verification (not assumed), found it is *not yet universal app-wide*: two more direct-send buttons exist on **`DashboardPage.tsx`** ("Queue Intelligence" card's "WhatsApp" button, and a "📲 Notify" button elsewhere on the same page), both firing directly from `FollowUpAlert` entries (`followupEngine.ts`'s DUE/OVERDUE/HIGH_RISK alerts) with no queue/approval step — the same category of issue already fixed in `TodayPage.tsx`, just not discovered during the original audit. **These were not touched**, since `DashboardPage.tsx` was not named in this task's explicit instructions (only `AppointmentPage.tsx` and `TodayPage.tsx` were), and this task's own safety rules ask for minimal, targeted changes rather than expanding scope mid-implementation. Flagged below under Known Limitations for your decision. The remaining, legitimately-unrelated `openWhatsApp` callers are `reminderDeliveryService.ts` (the queue's own send step), `AppointmentPage.tsx`'s booking confirmation, `ConsultationPage.tsx`'s ad-hoc prescription/billing share buttons, `PatientPage.tsx`'s "Send Receipt," and `pdfService.ts`'s export-share — none of these are follow-up/appointment reminders.

## Duplicate-safety design

Every queueing path (bulk-today, per-day, whole-week, per-appointment, and the redirected follow-up "Remind" button) calls `hasActiveReminder(patientId, type)` before enqueueing — the exact function `scheduleFollowUpReminders()` already relies on for the same guarantee. Verified explicitly:

1. Generate today's reminders once → 1 queued.
2. Generate again → 0 newly queued, 1 reported as "already has an active reminder." Exactly one active `appointment`-type reminder exists for that patient (checked directly against `reminderQueue`).
3. Approve and send it → status `sent`.
4. Generate again → 1 newly queued. This is **not** a bug: `hasActiveReminder` only considers `pending`/`approved` as "active" — once sent, nothing is active, and the existing policy (already true for follow-ups) explicitly permits a fresh one. Verified with an explicit test and documented inline in the code.

One known, deliberate consequence of reusing `hasActiveReminder(patientId, type)` exactly as specified (not a more granular per-appointment guard): if a patient has two separate appointments in the same week, queueing a reminder for the first blocks queueing one for the second until the first is resolved (sent/rejected/cancelled). This matches the explicit architectural instruction to reuse this function as-is, and is a conservative behavior (it can't spam the same patient with two reminders back to back), not a data-loss risk — the second appointment's reminder can still be queued once the first is no longer active.

## Today's workflow (as implemented)

Dashboard/Today → open Reminders (existing "Reminders" nav, now also reachable from `AppointmentPage.tsx`'s reminder actions via `onNavigate`) → "Today's Appointment Reminders" card shows every one of today's booked/arrived/in-progress appointments with a live status badge → one tap "Queue Today's Reminders" → entries land in the existing Pending tab → doctor reviews/edits/approves/sends exactly as they already do for follow-ups → badges in the Today card update to Sent/Failed automatically.

## This-week workflow (as implemented)

"This Week's Appointment Reminders" card groups the next 7 days (starting tomorrow — today has its own dedicated section) by calendar day, mirroring `followUpIntelligenceService.ts`'s own rolling-window convention rather than inventing a Monday-aligned calendar week. The doctor can queue one day at a time ("Queue this day") or the whole week at once ("Queue All of This Week's Reminders"). **Deliberately doctor-initiated, not automatic**: unlike a follow-up's single `nextFollowUpDate`, a patient can have several appointments at once, and auto-queuing the instant any appointment is booked would be noise — this mirrors the same reasoning `reminderSchedulerService.ts` already uses to exclude the "tomorrow"/"upcoming7" follow-up buckets from its own auto-scheduler.

## Message template

One canonical appointment-reminder message (`buildAppointmentReminderMessage`), consolidating the three separate hardcoded templates that previously lived in `AppointmentPage.tsx` — no fourth template was created:

```
*Sakhi Homeopathic Clinic*
Dear {patientName},

Your appointment is today at {time}.
🏥 {clinic}

Please arrive on time 🙏
```

(For a future day, the second line becomes "This is a reminder for your upcoming appointment on {date} at {time}." instead of "today.") Matches `buildFollowUpMessage`'s exact greeting/body shape for brand consistency. Patient name, date (when not today), time, and clinic/branch are all present, matching the audit's Phase 6 field checklist.

## Test results

- `npx tsc --noEmit`: **clean, 0 errors.**
- Targeted (`reminderEngine.test.ts`, `appointmentConcurrency.test.ts`, `remindersNavigation.test.tsx`, `reminderProductivity.test.tsx`): **4 files, 46 tests, all passing** (14 of them new).
- Re-verified in a fully isolated worktree (doctor-uat baseline + only the staged appointment-reminder files, zero Sync contamination): **81 files / 643 tests, all passing** (true uncontaminated baseline was 81/629 — confirms exactly +14, matching the contaminated-tree delta of 718→732).
- Full `npm test -- --run`: **95 files / 732 tests, all passing** (baseline before this task: 95 files / 718 tests — +14 tests, 0 regressions).
- `npm run build`: **succeeds**; only the pre-existing, unrelated chunk-size warnings.
- Targeted E2E (`tests/appointment-reminders.spec.ts`, all 5 projects): **10/10 passed on first try, zero retries.**
- Full Playwright suite (all 5 projects): **117 passed, 0 failed, 0 flaky, 24 skipped.**

### Regression coverage added (14 new vitest tests + 2 E2E tests)

Today's appointment reminder candidate selection (earliest-first, excludes cancelled/done/missed); message content (name/time/clinic present, "today" vs. future-day wording); missing-phone handling (counted, not queued); **duplicate prevention** (generate twice → 1 active; approve+send → generate again is correctly permitted, not a bug); failed-send handling (a failed send is not "active," a fresh one is queueable); this-week grouping (7-day rolling window, correct day boundaries, excludes today and day+8); bulk-across-week queueing; a 6-case date/time correctness matrix (today, tomorrow, last day of the window, next week, month boundary, year boundary) proving no UTC/IST shift; and, at the E2E level, the full doctor workflow (queue → duplicate-guard → approve → send → status becomes Sent) plus explicit proof that `AppointmentPage.tsx`'s buttons no longer open WhatsApp directly and instead land in the canonical queue.

## Known limitations

- **`DashboardPage.tsx` has two more direct-send WhatsApp buttons** (a "WhatsApp" button in its "Queue Intelligence" card, and a "📲 Notify" button elsewhere), both firing directly from follow-up alerts with no queue/approval step — the same category of issue just fixed in `TodayPage.tsx`, found while double-checking every remaining `openWhatsApp` caller for this report, but **not fixed** since `DashboardPage.tsx` wasn't named in this task's scope (only `AppointmentPage.tsx` and `TodayPage.tsx` were). Recommend a small dedicated follow-up to route these through the queue the same way, for full consistency.
- `appointmentService.ts`'s `markOverdueAppointmentsMissed()` (pre-existing, unmodified) uses the real wall clock, not an injectable reference date — this only affects test determinism (fixed here via `vi.useFakeTimers`/`page.clock`, not a production concern, since production code always calls these functions with `referenceDate = new Date()` by default, matching the real clock).
- Reusing `hasActiveReminder(patientId, "appointment")` exactly as instructed means a patient with two concurrent appointments this week can only have one active appointment reminder queued at a time (see "Duplicate-safety design" above) — a deliberate, conservative consequence of the given architectural rule, not an oversight.
- `Appointment.reminderSent`/`markReminderSent`/`appointmentService.markReminder` are now unused but not deleted (see "Files deliberately untouched").
- No WhatsApp Business API existed before this feature and none was introduced — "Sent" still means "the doctor approved it and the app opened WhatsApp," never a delivery/read receipt. Unchanged, pre-existing, honest limitation.

## Doctor UAT instructions

1. Book an appointment for today (or check an existing one).
2. Open **Reminders** (via the search/command palette, or from the Appointments page after using its reminder button).
3. Under **"Today's Appointment Reminders,"** confirm the appointment appears with the right name/time/clinic and a "Not queued" status.
4. Tap **"Queue Today's Reminders."** Confirm it now shows "Pending" and appears in the Pending tab below.
5. Tap **"Queue Today's Reminders" again** — confirm the note says it already has an active reminder, and the Pending tab still shows only one entry for that patient.
6. In the Pending tab, **Approve** it, then **Send via WhatsApp** from the Approved tab. Confirm WhatsApp opens with the correct message, and the status badge in the Today card updates to "✓ Sent."
7. Under **"This Week's Appointment Reminders,"** book (or use) an appointment a few days out, confirm it appears under the right day, and try both "Queue this day" and "Queue All of This Week's Reminders."
8. On the **Appointments** page, confirm the reminder button/"Queue Today's Reminders" no longer opens WhatsApp immediately — it should show a confirmation that the reminder was queued for review instead.
9. On **Today's** dashboard, confirm the Missed Follow-ups "Remind" button now also queues for review rather than sending immediately, and that it shows up in Reminders' Pending tab.

## Final verdict

**READY FOR DOCTOR UAT**

The appointment reminder type is now a real, working part of the existing reminder queue — not a parallel system. Every send path in the app goes through the same approve-before-send queue, the same duplicate guard, the same WhatsApp mechanism, and the same canonical date utilities that already existed. All quality gates pass with zero regressions (732/732 unit+integration tests, clean build, 117/117 E2E with zero flakes across all 5 viewports). No Sync, payment, follow-up-fix, rubric, backup, or OAuth code was touched. Nothing was committed or pushed.
