# Clinical Workflow System — Architecture (RC1)

RC1 added five doctor-facing workflow layers on top of the existing
patient/consultation/appointment data model: the **Action Dashboard**,
**Follow-up Management**, the **Reminder Center**, the **Payment
Tracker/Ledger/Dashboard**, and the **Rubric Suggestion approval gate**.
None of them introduced a new entity table. All five read and write the
same `Patient` / `Consultation` / `ReminderQueueEntry` records the rest of
the app already owns — this document is about how they share that data
without duplicating its meaning.

## The rule that makes this hold

Every "what does this number mean" question has exactly one owner. Nothing
outside that owner recomputes the answer independently.

| Question | Owner | Everyone else does |
|---|---|---|
| Is this consultation's payment outstanding / collected? | `paymentService.ts` (`getConsultationOutstanding`, `getConsultationCollected`) | Calls through it |
| Which patients are overdue / due today / upcoming? | `followUpIntelligenceService.ts` (`getFollowUpBuckets`) | Calls through it |
| Is a follow-up cancelled? | `Patient.followUpCancelledDate === Patient.nextFollowUpDate` | Reads the comparison, never re-derives it |
| What reminders has this patient had? | `reminderQueueService.ts`'s own queue rows | Reads the queue, never keeps a separate counter |

This list used to be three separate answers for "is this payment
outstanding" alone — one each in `RevenuePage.tsx`, `DashboardPage.tsx`,
and `PatientPage.tsx` — before RC1 consolidated them. The Patient Ledger,
the Doctor Action Dashboard, and the Payment Dashboard cannot disagree
about a patient's balance, because none of them compute it themselves.

## Data flow

```
                        ┌──────────────────────┐
                        │   Consultation record  │  paymentStatus, fee,
                        │   (services/db.ts)      │  amountReceived, ...
                        └───────────┬─────────────┘
                                    │ read/write
                                    ▼
                        ┌──────────────────────┐
                        │   paymentService.ts    │  outstanding/collected
                        │   (single source of    │  rules; recordPayment()
                        │    truth for money)     │  writes via saveConsultation()
                        └───────────┬─────────────┘
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
   ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐
   │ Patient Ledger      │ │ Doctor Action       │ │ Payment Dashboard      │
   │ (PatientPage.tsx    │ │ Dashboard           │ │ (RevenuePage.tsx)      │
   │  Finance tab)        │ │ (Pending Payments   │ │  6 cards, every one    │
   │                      │ │  card)              │ │  -> FilteredPatientList│
   └───────────────────┘ └───────────────────┘ └───────────────────────┘


                        ┌──────────────────────┐
                        │   Patient record        │  nextFollowUpDate,
                        │   (services/db.ts)       │  followUpCancelledDate
                        └───────────┬─────────────┘
                                    │ read/write
                                    ▼
                    ┌────────────────────────────────┐
                    │ followUpIntelligenceService.ts    │  buckets (real-time)
                    │  getFollowUpBuckets()              │  + history (derived)
                    │  getFollowUpHistory()              │
                    └────────────┬───────────────────────┘
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
   ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐
   │ FollowUpPage.tsx     │ │ Doctor Action       │ │ Intelligent alerts      │
   │ (7 status tabs +      │ │ Dashboard           │ │ (followupEngine.ts,     │
   │  Cancel action)        │ │ (4 follow-up cards) │ │  chronic/long-gap/      │
   │                        │ │                     │ │  recurring-miss)         │
   └───────────────────┘ └───────────────────┘ └───────────────────────┘


   Dashboard cards ─┐
   Payment Dashboard ─┼──► FilteredPatientList (shared, presentational only)
   Reminder bulk-send ┘         select patients, "Send Reminders"
                                 │
                                 ▼
                       enqueueReminder()  (reminderQueueService.ts,
                            │              status: "pending")
                            ▼
                    Reminders page — doctor reviews, edits, approves
                            │
                            ▼
                    WhatsApp opens with the prepared message
                    (nothing is ever sent without this step)
```

## Follow-up cancellation: why a marker, not a delete

`Patient.nextFollowUpDate` is **derived**, not directly editable —
`patientService.syncPatientFollowUp()` recomputes it from every
consultation's `followUpDate` field on every consultation save, always
picking the earliest future date. A "Cancel follow-up" action that simply
cleared `nextFollowUpDate` would work for exactly as long as it took the
next consultation save (for that patient, any patient) to silently
recompute it back.

Instead, `patientService.cancelFollowUp()` writes
`followUpCancelledDate = <the current nextFollowUpDate>`.
`getFollowUpBuckets()` treats a patient as cancelled only while
`followUpCancelledDate === nextFollowUpDate`. The moment a fresh
consultation sets a *different* `nextFollowUpDate`, the marker no longer
matches — the follow-up naturally un-cancels itself without any code
having to remember to clear the marker.

## The AI-suggestion approval gate

`learningEngine.ts` (frequentist, outcome-weighted remedy suggestions) and
`remedyEngine.ts` (materia-medica keyword matching) both ran automatically
against the doctor's typed/dictated case text before RC1 — the gap RC1
closed was that suggestions were **read-only**. `ConsultationPage.tsx` now
has an explicit "Approve → Add to Rx" action per suggestion in both the
sidebar (`learnedPatterns`, evidence/confidence-scored) and the mobile
chip strip (`remedySuggestions`). Nothing is written to
`formData.medicines` — and therefore nothing reaches the saved
prescription — until the doctor clicks. An already-approved suggestion is
marked "✓ Added to Rx" rather than being re-addable, so there is no way to
accidentally duplicate a remedy by clicking twice.

## Files

| File | Role |
|---|---|
| `src/services/dashboardActionService.ts` | Doctor Action Dashboard's data source. Computes the 9 cards' patient sets by calling `followUpIntelligenceService`, `paymentService`, `reminderQueueService`, `appointmentService` — introduces zero new data-access logic of its own. |
| `src/services/paymentService.ts` | Single source of truth for "outstanding" / "collected". `recordPayment()` writes through `saveConsultation()` — no parallel write path. `getPaymentSummary()` / `getOutstandingPatients()` / `getPaymentDashboardDrilldowns()` back the Payment Dashboard's 6 cards. |
| `src/services/followUpIntelligenceService.ts` | `getFollowUpBuckets()` (real-time: overdue/today/tomorrow/upcoming7/noDate/cancelled) and `getFollowUpHistory()` (derived: completed/missed/pending per advised follow-up date). |
| `src/services/patientService.ts` | `syncPatientFollowUp()` (pre-existing, unchanged) and `cancelFollowUp()` (RC1) — the only writer of `followUpCancelledDate`. |
| `src/services/reminderQueueService.ts` | Reminder queue CRUD + state machine (pre-existing). `listRemindersByPatient()` (RC1) is the Patient Ledger's reminder-history data source — no separate counter. |
| `src/components/FilteredPatientList.tsx` | One reusable drill-down list. Every dashboard card, every payment card, and the reminder bulk-select flow render through this — not five different bespoke lists. |
| `src/pages/DashboardPage.tsx` | Doctor Action Dashboard — the app's landing page (`App.tsx`'s default route). 9 cards, each either opens `FilteredPatientList` or (Pending Reminders) navigates straight to the Reminders queue. |
| `src/pages/FollowUpPage.tsx` | 7 status tabs (Overdue/Due Today/Tomorrow/Upcoming/Completed/Cancelled/No Follow-up Set), analytics, intelligent alerts, and the Cancel quick action. |
| `src/pages/RevenuePage.tsx` | Payment Dashboard — 6 cards, all backed by `paymentService.ts`. |
| `src/pages/PatientPage.tsx` | Patient Ledger: consultation timeline (History tab), payment timeline + totals (Finance tab), reminder history (Overview tab). |
| `src/pages/ConsultationPage.tsx` | Consultation workflow — payment recording fields, and the AI-suggestion approval gate (`learnedPatterns`/`remedySuggestions` → "Approve → Add to Rx"). |

## What this system deliberately does not do

Per RC1's explicit scope boundary — carried forward unchanged into this
certification pass:

- No accounting, GST, invoices, receipts, or bookkeeping. Payment tracking
  exists so a doctor who receives money later via WhatsApp has somewhere
  to record it against the visit it belongs to — nothing more.
- No automatic (non-doctor-triggered) WhatsApp sending. Every reminder is
  queued `pending`, requires an explicit approve action, and only then
  opens WhatsApp with a prepared (editable) message.
- No AI auto-selection anywhere. Suggested remedies, like suggested
  reminders, require an explicit doctor action before they affect a
  patient record.
