# Payment Screenshot → Patient Payment — Implementation Report

Branch: `feature/payment-screenshot-workflow` (off `doctor-uat`, not yet committed/pushed — see note at the end).

## Doctor requirement

A patient often doesn't pay at the consultation, pays later via UPI/bank transfer, and sends the doctor a payment screenshot on WhatsApp. The doctor can forget to update Sakhi, leaving the ledger unpaid, revenue wrong, no receipt sent, and later confusion. Requested solution: upload the screenshot, identify the patient, review/confirm the payment details, and have it update everywhere — **not** a WhatsApp inbox integration; the screenshot is manually uploaded.

## Before

- No UI anywhere in the app could record a payment after the fact. `paymentService.ts` already had a fully-built, tested `recordPayment()` function and a `compressPaymentScreenshot()` helper — both **never called by any screen**.
- The only payment-related UI was `PatientPage.tsx`'s Finance tab: a read-only history table (view an already-attached screenshot, queue a WhatsApp receipt for an already-recorded payment).
- A patient's later payment had no path into the app short of manually re-opening and editing a past consultation's raw fields (no dedicated screen existed for that either).

## After

**"Record Later Payment"** — reachable from two places:
1. **Patient Ledger** (`PatientPage.tsx` → Finance tab) — patient pre-selected, one tap in.
2. **Revenue / Payment Dashboard** (`RevenuePage.tsx` header) — general entry, includes patient search.

Both open the same component (`RecordLaterPaymentFlow.tsx`), avoiding duplicate workflows. Flow:

```
Select patient (search, explicit confirm card) 
  → Pick which billed visit this payment settles (auto-picked if only one)
  → Take Photo / Upload Screenshot (preview, replace, remove, or skip)
  → Review & edit: amount, date, method, reference, notes
  → Duplicate check (patient + amount + date + reference)
  → Confirm & Record Payment
  → Success: View Receipt / Share Receipt / Done
```

Target time (no OCR needed for a doctor who already knows the amount): well within 30 seconds.

## Architecture used (audit findings, all reused — nothing rebuilt)

| Capability | Reused from | Notes |
|---|---|---|
| Payment write | `paymentService.ts`'s `recordPayment()` | The exact same canonical path (`saveConsultation()`) every other payment edit uses — no second model, no parallel ledger. Was fully built and tested but never called by any UI before this feature. |
| Screenshot compression | `paymentService.ts`'s `compressPaymentScreenshot()` | Already used by `ConsultationPage.tsx`'s inline payment fields — 1024px/JPEG quality 0.72, unchanged. |
| Screenshot storage | `Consultation.paymentScreenshotDataUrl` (already on the schema, V54) | No migration — the field already existed, just unused by any new-payment flow. |
| Receipt | `buildPaymentReceiptMessage()` + `enqueueReminder()` (reminder-queue approve-before-send) | The exact mechanism `PatientPage.tsx`'s existing "Send Receipt" button already uses — no new send path, no PDF/print receipt invented. |
| Patient search | `usePatientSearch` hook | Same hook `PatientPage.tsx` uses. |
| Backup | `clinicExportService.ts`'s whole-`Consultation` export | Already includes every payment field and the screenshot with zero changes — confirmed by reading the export code, not assumed. |

**New, genuinely new logic (small, additive):**
- `findLikelyDuplicatePayment()` in `paymentService.ts` — no duplicate-*payment* detector existed before (a duplicate-*patient* detector is a different, already-existing thing).
- A `loadPatientConsultations()` refresh call after a successful `recordPayment()` — **this was a real gap found during implementation**: `recordPayment()` writes straight to Dexie, bypassing the `useConsultationStore` zustand cache that `PatientPage.tsx`'s Ledger actually reads from. Without this one line, the Ledger would have kept showing the pre-payment status until something else happened to reload it. This is a read-refresh, not a second write path — the payment transaction itself still has exactly one source of truth.

## OCR/AI — deliberately not added

Repo-wide search found **zero** OCR/vision/text-extraction capability anywhere in this codebase, and none of the app's existing AI engines (`remedyEngine.ts`, `aiReasoningEngine.ts`, the gated `ai/*` files) do image analysis. Per the zero-cost/no-external-service requirement and the explicit instruction to stop and report rather than silently add one: **no external OCR/AI API was introduced.** Step 3 ("Extract Payment Information") is a fast manual-entry step instead — large numeric-keypad amount field, payment-method chips, date defaulting to today, optional reference field. Nothing is invented; every field starts blank/defaulted-to-today and is always doctor-confirmed before it's written. If OCR is wanted later, this is a clearly separable follow-up (see Future Improvements) — it does not block this feature today.

## Files changed

| File | Change |
|---|---|
| `src/components/RecordLaterPaymentFlow.tsx` | **New.** The whole mobile-first wizard: patient select/confirm → visit pick → screenshot → review/edit → duplicate check → confirm → success/receipt. |
| `src/services/paymentService.ts` | Added `findLikelyDuplicatePayment()` and its `DuplicatePaymentCandidate` type. No existing function changed. |
| `src/pages/PatientPage.tsx` | Added a "Record Later Payment" button to the Finance tab + modal wiring (patient pre-selected). |
| `src/pages/RevenuePage.tsx` | Added a "Record Payment" button to the header + modal wiring (general entry, patient search included). |

**Explicitly not touched:** `src/services/sync/`, `src/components/sync/`, `SettingsPage.tsx`, `appLifecycleRuntimeService.ts`, `backupManager.ts`, `originIdentityService.ts`, `rubricApprovalService.ts`, `db.ts` (all pre-existing, uncommitted Sync Phase 2/3 work from before this session, confirmed unmodified by `git diff` — this feature needed no schema change and no Sync dependency). No new npm dependency was added (`git diff package.json`/`package-lock.json` is empty).

## Tests added

- **Unit/integration — duplicate detection** (`src/__tests__/integration/paymentDuplicateDetection.test.ts`, 7 tests): no-prior-payment → null; exact reference match; same-amount-same-date match; different amount on same date → no match; same amount on different date → no match; never crosses patients; ignores consultations with zero received.
- **Integration — full flow** (`src/__tests__/integration/recordLaterPaymentFlow.test.tsx`, 6 tests, against real fake-indexeddb, through the actual `recordPayment()` write path): records a full payment and verifies the DB *and* the `useConsultationStore` (Ledger) reflect it; **adds to** an existing partial payment rather than overwriting it; shows the duplicate-payment warning and requires explicit override before the confirm button enables; shows a clear error and leaves the DB record unchanged when the save fails (no partial record); blocks confirmation for an invalid (zero) amount; shows a visit picker when a patient has more than one billed consultation.
- **E2E** (`tests/mobile/record-later-payment.spec.ts`): the full doctor workflow — register a patient → book/queue/start a consultation → bill it, leave it unpaid, save → open the same patient's Ledger → Record Later Payment → pick the visit → **upload a real screenshot** (Playwright runs a real Chromium, so `compressPaymentScreenshot()`'s actual canvas/image pipeline is genuinely exercised, not mocked) → review/edit amount+method+reference → confirm → verify the success screen, receipt preview text, and that the Ledger now shows "PAID" with a viewable proof. No real patient/payment data — synthetic name/phone generated per run.

## Test results

- `npx tsc --noEmit`: clean, zero errors.
- Vitest full suite: **94 files / 695 tests, all passing** (up from the prior 92/682 baseline — +13 new tests, zero regressions).
- `npm run build`: succeeds; only the pre-existing, unrelated chunk-size/backup-import warnings.
- Playwright, targeted (`record-later-payment.spec.ts` across all 4 mobile projects): all pass. One first-pass flake was found and root-caused (navigating away from the consultation screen immediately after clicking Save, before its background side effects settled) and fixed with a proper wait for the existing save-confirmation toast — re-verified passing cleanly afterward, not just retried into passing.
- Playwright, full suite: **97 passed, 24 pre-existing skipped, 0 failed** (up from the 93/24/0 baseline).

## Mobile UX verification

Built mobile-first per the spec: large touch targets (52px+ primary buttons, 44px+ chips), native camera (`capture="environment"`) and gallery inputs side by side, big numeric-keypad amount field, payment-method chips (not a native `<select>`, consistent with this codebase's established UI guideline), no horizontal scrolling (verified structurally — the sheet is a bottom-anchored full-width panel, same pattern as the app's other mobile sheets), one clearly primary confirm action per step. Verified end-to-end on 4 emulated mobile viewports via Playwright (Pixel 5, 360×800, 390×844, 412×915) — the true test of this feature, since it's the actual doctor's device shape, not just a visual read.

## Duplicate protection

Runs automatically the moment the doctor taps "Check & Continue," using patient + amount + payment date + reference number (whichever of those exist). An exact reference-number match on a *different* amount/date is the strongest signal and is checked first; failing that, an exact amount+date match on the same patient. On a match: a clear, non-blocking "Possible duplicate payment" banner shows what's already recorded, and the confirm button stays **disabled** until the doctor explicitly checks "This is genuinely a different payment" — it never silently blocks a legitimate second payment, and never silently creates a duplicate either.

## Security / privacy

- No screenshot, extracted value, or payment amount is ever passed to `console.log`/`console.warn`/`console.error` anywhere in the new code (verified by direct grep, not assumption).
- No URL, query string, or route ever carries screenshot data or payment values.
- No external service of any kind is called — the entire flow is local: Dexie (via the existing service layer) and, for the receipt, the existing local reminder-queue/WhatsApp-link mechanism (nothing new).
- Screenshot storage follows the existing model exactly: compressed to a bounded JPEG data URL (typically tens of KB, not a multi-MB phone photo) before ever touching IndexedDB — no new retention policy needed since this reuses the field the app already had.
- No new third-party dependency was added.

## Backup implications

None required. `clinicExportService.ts` already exports whole `Consultation` records (`db.consultations.toArray()`, no field allowlist) — every field this feature writes, including the screenshot, was already covered by the existing backup/export/restore pipeline before this change.

## Known limitations

- No OCR — every field is doctor-entered (a deliberate, reported decision, not a gap; see above).
- The duplicate check is a heuristic (amount+date, or an exact reference match) — it cannot catch every real duplicate (e.g. a genuinely different payment that happens to share amount and date with no reference number entered) and deliberately errs toward "warn, don't block," matching the doctor's own stated preference from the earlier duplicate-*patient* feature work in this app.
- "Which visit does this payment settle" only lists consultations that already have a `fee` set. A visit billed for ₹0, or never billed at all, has nothing to attach a later payment to by design (there is genuinely nothing to reconcile) — the doctor is told this plainly rather than the flow inventing a fee.
- This branch was created off `doctor-uat` and inherits that branch's environment: the uncommitted Sync Phase 2/3 bundle is still present in the working tree (untouched, as required) and would need the same exclusion treatment this session already established if this feature is ever packaged for its own release.
- Not yet committed or pushed — this report describes a verified, working implementation on disk, not a shipped commit. No commit/push was made without your explicit go-ahead, consistent with the git discipline established earlier in this session.

## Future improvements (not needed for UAT)

- Optional on-device OCR (e.g. Tesseract.js, a genuinely free/local library, no server) as a convenience layer that still requires doctor confirmation — a real future option if this manual-entry flow proves too slow in practice, explicitly deferred rather than added speculatively.
- Per-payment-mode "recent reference" chips (mirroring the app's existing favorites/recents pattern elsewhere) once real usage data exists.
- A dedicated "recent duplicate payments merged" audit log if the override path sees real use.

## Final verdict

**READY FOR DOCTOR UAT** (pending your review and the commit/push you did not yet authorize for this branch). All quality gates pass, the feature reuses the canonical payment model with no parallel ledger, no Sync/OAuth/backup architecture was touched, and the full doctor workflow — screenshot in, confirmed payment out, ledger/revenue/receipt all updated from one transaction — is genuinely implemented and passing end-to-end, not just documented.
