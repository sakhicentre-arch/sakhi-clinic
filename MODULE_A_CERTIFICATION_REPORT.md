# Module A — Production Data Layer — Certification Report

**Commit base:** `071f7e182e534265fbe8dcd7e7ea1298f2d01495` plus Module A's changes (now isolated to 13 files after CRLF-noise cleanup — see `git status`)
**Date:** 2026-08-01
**Method:** No external audit document exists in the repository (verified by search). This report treats the certification request's own task list as the checklist and independently re-verifies every claim rather than restating prior sessions' reports.

**Evidence discipline:** every claim is tagged **[MEASURED]** (a command was run, raw output quoted or described), **[REASONED]** (derived from a documented platform guarantee, not executed), or **[UNTESTED]** (not verified — stated as a gap).

> **2026-08-01 addendum — independent re-verification pass.** A second, independent session re-ran every command in this report from a cold environment. Full findings, raw command output, and one newly-identified issue are in `MODULE_A_TEST_REPORT.md`. Headline results: `tsc`, the production build, and 205-206/206 tests all independently reproduced; the reason a prior audit could not execute the suite was tracked down to a cross-filesystem-boundary mount (not the test code or config — see that report §2); and the "single flake, not reproducible in isolation" line below (§3) was found to be inaccurate — it reproduces in isolation intermittently. That correction is reflected in §3 directly rather than only here.

**A note on this session's own environment:** the development machine went to sleep multiple times mid-test-run during this certification pass. One corrupted run reported a 1899-second duration for a suite that normally completes in 10–16 seconds, with spurious timeouts caused by clock disruption on resume. This is disclosed as an execution-environment limitation, not papered over — the certification below relies on three consecutive clean, normal-speed full-suite runs (206/206 passed) obtained before the interruptions began, not on the corrupted runs.

---

## 1. Executive Summary

Module A's six contracted fixes are implemented, and this certification pass found and fixed **one severe, previously-undisclosed defect**: the outbox-cap enforcement added during the prior audit was wired directly into the write path shared by every patient, appointment, and consultation save. Measured directly against a real Dexie instance, a full enforcement run at the actual 10,000-row cap took **over 100 seconds**. Left as originally wired, the doctor's save would have appeared to hang for over a minute the first time the sync outbox crossed its cap. This has been corrected by moving enforcement to the existing periodic background maintenance runtime (`maintenanceRuntimeService.ts`, already invoked every 5 minutes and once at app start), which never runs inside a clinical write's await chain. The fix is proven by a test that measures a single write staying fast even 200x over cap.

A second, smaller defect was also found and fixed: a check-then-write race in the origin-identity backfill, structurally identical to the appointment-booking race Module A itself was built to fix.

Module A does **not** provide disaster recovery. That remains entirely unaddressed and is not implied otherwise anywhere in this report.

## 2. Evidence Collected

- `git log -1`: `071f7e182e534265fbe8dcd7e7ea1298f2d01495`
- `npx tsc --noEmit`: clean, exit 0, verified repeatedly through every change in this session
- `npm run build`: succeeds, `dist/` produced with PWA precache
- **Full suite, three consecutive clean runs before the sleep interruptions**: 23 test files, 206 tests, all passed, each run completing in 10–17 seconds (normal speed, no clock disruption)
- **[MEASURED]** Real IndexedDB probe (raw, outside Dexie): confirmed real browsers throw `VersionError` opening at a version lower than stored; Dexie is deliberately more lenient for backward-compatible schema subsets
- **[MEASURED]** `bulkDelete` cost in this test harness (`fake-indexeddb`) scales super-linearly: 48ms/146ms/687ms/4793ms deleting 50/100/200/500 keys in one call — roughly 18x cost for 4x volume
- **[MEASURED]** A full `enforceOutboxCap(10000)` run against a real Dexie instance seeded with 10,000 synced rows: **100,402ms** (100.4 seconds), even after chunking the delete into batches of 200
- **[MEASURED]** After moving enforcement off the write path: a single `enqueueOutbox` call, with a 2,000-row backlog already 200x over a test cap, completes in under 500ms
- **[MEASURED]** v49→v50 migration against 5,000 patients / 10,000 consultations: ~10–40ms across repeated runs (schema-only, no data transform, does not scale with row count)
- **[MEASURED]** `checkOriginIdentity()` with 5,000 unrelated patient rows present: single-digit milliseconds
- `grep -rn "QuotaExceeded|storage.*quota" src/`: zero matches — not implemented
- `npx vitest run --coverage`: fails immediately, `@vitest/coverage-v8` not installed — no coverage percentage has ever been measured
- No mutation-testing framework exists in this repository. Every fix in this and prior sessions was manually verified by reverting it, confirming the targeted test failed with the expected signature, then restoring it — a real but manual, non-automated practice.

## 3. Remaining Operational Risks

| Risk | Status |
|---|---|
| Outbox-cap enforcement blocking a clinical save | **FIXED this session** — moved to background maintenance runtime, proven by test |
| Origin-identity backfill race condition | **FIXED this session** — wrapped in a transaction, proven by test (mutation-verified: reverting reproduces the double-write) |
| `bulkDelete`'s super-linear scaling in `fake-indexeddb` | **MITIGATED (chunking), UNVERIFIED against real browser IndexedDB.** Whether real IndexedDB shares this scaling characteristic is unknown — no on-device measurement was possible. Chunking is a safe pattern regardless, but its necessity on a real device is unconfirmed. Independently reproduced in a second session: 12.5x cost for 4x delete volume (this session measured 18x) — same super-linear direction, different exact ratio, consistent with the test's own disclaimer that ms are not guaranteed run-to-run. |
| No storage-quota handling anywhere in the codebase | Confirmed by grep, not fixed — out of Module A's contracted scope, but real |
| **CORRECTED 2026-08-01:** `outboxCap.test.ts`'s "prunes synced entries before pending ones" test is a genuine intermittent failure, reproducible in isolation | An independent re-verification session reproduced this failing on 2 of 4 full-suite runs, including once immediately reproduced again by re-running the single file alone. **Root cause identified:** the test's pending rows are inserted without an explicit `timestamp`, so multiple rows can share the same millisecond value from `outboxService.ts`'s `nowIso()`; `enforceOutboxCap`'s fallback sort has no secondary tiebreaker, so under a timestamp tie it can delete a different pending row than the test's assumed-oldest `PENDING-0`. Not a data-loss risk (the outbox has no consumer today), but a real correctness gap in the tiebreaker, disclosed here rather than dismissed as environmental. See `MODULE_A_TEST_REPORT.md` §4 for full detail. **Not yet fixed** — recommended fix: add `id` (or insertion sequence) as a secondary sort key in `enforceOutboxCap`'s fallback path. |

## 4. Disaster Recovery Assessment

Unchanged from the prior certification pass — re-verified, not re-derived from assumption. Module A does not provide disaster recovery; it hardens write integrity on an intact device only.

| Scenario | Recoverable? | Why | Mitigation |
|---|---|---|---|
| Browser profile deleted | NO | IndexedDB is profile-scoped | Manual backup file only |
| Windows reinstall | NO | Wipes profile and all browser storage | Manual backup file only |
| Android uninstall/reinstall | NO | Android clears app storage on uninstall | Manual backup file only |
| Laptop failure | NO | No off-device copy exists automatically | Manual backup file only |
| Hard disk failure | NO | Same as above | Manual backup file only |
| Browser storage corruption | NO | No repair mechanism exists; `runDexieHealthCheck` only detects, never repairs | Manual backup file only |

For every scenario, the only recovery path is a `sakhi.backup.v1` file the doctor manually exported and stored off-device beforehand. This is documented for the doctor directly in `DOCTOR_OPERATIONAL_GUIDE.md`.

## 5. Production Readiness

Module A meets its own contract's acceptance criteria (A1–A8), each backed by an automated, individually-verified test. This certification pass's value was specifically in NOT stopping at "tests pass" — measuring the outbox-cap path under realistic volume surfaced a defect severe enough to have caused real, doctor-visible save delays, which no test written against small numbers would ever have caught. That defect is now fixed and proven.

**Task 1 (real database validation):** No real Sakhi Clinic database export is available. Certification of Module A against actual production data has **not** been performed and cannot be claimed. See the validation plan below — this is a precondition, not a formality.

### Required real-database validation plan (Task 1)

- **Export format:** the app's own `sakhi.backup.v1` bundle (via Download Backup), not a raw database file — this exercises the same import path a real recovery would use.
- **Anonymization:** before this file leaves the doctor's control, patient names, phone numbers, and any free-text fields likely to contain identifying details (Case Story, Chief Complaint) should be replaced with synthetic placeholders that preserve structure (same field lengths/shapes) but not real identity. This should be a scripted, reviewable transform, not manual editing, so it can be re-run and audited.
- **Validation procedure:** import the anonymized bundle into a v49 test instance, confirm it opens correctly; then run it through the actual v49→v50 migration; confirm row counts for patients, consultations, appointments, and prescriptions (medicines embedded in consultations) match the source exactly; spot-check consultation-to-patient and appointment-to-patient relationships are intact.
- **Rollback verification:** repeat the rollback test in `dbCertification.test.ts` against this real (anonymized) dataset specifically, not just synthetic test rows.
- **Success criteria:** zero row-count discrepancies, zero broken patient/consultation/appointment relationships, migration completes without error, rollback to the reverted code path leaves all pre-existing data readable and unchanged.

**Certification of Module A remains conditional on completing this validation once a real (anonymized) export becomes available.**

## 6. Doctor Acceptance Checklist

See `MODULE_A_RELEASE_CHECKLIST.md` §7 for the full checklist. Summary: register a test patient, dictate into a consultation and confirm autosave survives a 30-second pause, attempt a genuine double-booking and confirm exactly one succeeds with a clear message, and confirm the doctor has personally made and located a real backup file. None of this has been performed with the actual doctor yet — it is a precondition, listed as such below.

## 7. Mandatory Preconditions Before Module B

1. **Real database validation (Task 1) must be completed** against an actual, anonymized Sakhi Clinic export — not synthetic data — before Module A is cited as fully certified.
2. **Doctor acceptance testing (§6) must be performed live**, not assumed from automated tests alone.
3. **On-device (real Android Chrome, not `fake-indexeddb`) measurement of the outbox-cap maintenance path** is strongly recommended given the super-linear scaling observed in this test harness — the fix (background scheduling) makes the *timing* safe regardless, but the *duration* of that background work on real hardware is still unverified.
4. **The false RVC-2 voice-validation sign-off claim** in the separate Implementation Contracts document must be corrected before it's cited elsewhere — unrelated to Module A's code, but sitting in the same document set.
5. **Explicit acknowledgment that Module A provides no disaster recovery** before any stakeholder communication implies otherwise — `DOCTOR_OPERATIONAL_GUIDE.md` states this plainly and should be shared with the doctor directly.
6. **[Added 2026-08-01]** Fix `enforceOutboxCap`'s fallback-sort tiebreaker (add a stable secondary key alongside `timestamp`) so the intermittent `outboxCap.test.ts` failure identified in `MODULE_A_TEST_REPORT.md` §4 stops being a coin-flip in CI. Low severity (no clinical data at risk — the outbox has no consumer yet) but should not ship un-fixed into a suite anyone relies on as a release gate.
7. **[Added 2026-08-01]** Before committing: delete the stale `.git/index.lock` (present in the working copy at time of writing; `git add`/`git commit` will fail until it is removed) — see `MODULE_A_TEST_REPORT.md` §2.

## Final Verdict

# GO WITH CONDITIONS

The conditions are the seven preconditions in §7. Two are new as of the 2026-08-01 independent re-verification pass (a test-tiebreaker fix and a stale git lock file to clear before committing) — both minor, neither a data-loss risk, both concrete and actionable rather than open-ended. The remaining five are unchanged: real-data validation, live human acceptance testing, and documentation accuracy elsewhere — not code found wanting. Every severity-affecting defect discovered across both certification passes (the outbox-cap blocking risk, the origin-identity race, the outbox-cap test tiebreaker) was either fixed and proven, or disclosed with a concrete fix identified and not yet applied.
