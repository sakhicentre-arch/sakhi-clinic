# Module A — Production Release Checklist

Commit: `071f7e182e534265fbe8dcd7e7ea1298f2d01495` plus Module A's changes (uncommitted at time of writing — see `git status`). Use this checklist in order; do not skip a section because an earlier one looked fine.

---

## 1. Pre-installation

- [ ] Delete any stale `.git/index.lock` before staging/committing (one was found present at the time of the 2026-08-01 independent re-verification; see `MODULE_A_TEST_REPORT.md` §2). `git add`/`git commit` fail silently-to-the-user (a clear git error, but easy to miss in automation) until it's cleared.
- [ ] Confirm no real Sakhi Clinic production database export has been used to validate this release (per the certification report, Task 1) — if one becomes available before release, it MUST be run through the validation plan in that report before this checklist continues.
- [ ] Confirm `tsc --noEmit` is clean on the exact commit being released.
- [ ] Confirm `npm run build` succeeds and produces `dist/` without errors.
- [ ] Confirm the full test suite passes on a machine that will not sleep mid-run (a real, disclosed limitation of this development environment — see the certification report's Evidence section for why this matters).
- [ ] Take a full manual backup export from the doctor's current, live installation, using the app's own **Download Backup** feature, and store it somewhere OFF the device being upgraded, before proceeding.

## 2. Installation (fresh device, no prior Sakhi Clinic data)

- [ ] Confirm the target browser is a supported version (current Chrome; the app depends on `SpeechRecognition`/`IndexedDB`, both need a reasonably current browser).
- [ ] Load the app; confirm it reaches the "Today" screen without error.
- [ ] Confirm `db.verno` is 50 on first load (check via DevTools → Application → IndexedDB, or via the diagnostics panel if enabled).
- [ ] Confirm no origin-mismatch banner appears (there is nothing to mismatch against on a genuinely fresh install — if one appears, stop and investigate before continuing).

## 3. Upgrade (existing device, pre-Module-A data present)

- [ ] Take a manual backup (§1) before touching anything.
- [ ] Deploy the new build to the same origin (same URL/host/port) the doctor currently uses. **Do not change the origin as part of this upgrade** — that would itself trigger the new origin-mismatch warning unnecessarily.
- [ ] Load the app. Confirm the Dexie migration from v49 to v50 completes silently (no visible error, no blank screen).
- [ ] Confirm every existing patient, consultation, and appointment record is present and unchanged. Spot-check at least 3 patients with consultation history, including one with prescribed medicines.
- [ ] Confirm the origin-identity baseline was recorded (`appMeta` table has exactly one row) — this is expected and is not itself a problem; it's the new safety check initializing.
- [ ] Confirm no origin-mismatch banner appears on this first post-upgrade load (it shouldn't — the baseline is set fresh to the current origin at this exact moment, per the certification report's rollback/migration evidence).

## 4. Migration validation

- [ ] Confirm `db.appointments`, `db.patients`, `db.consultations` row counts match a count taken immediately before the upgrade.
- [ ] Confirm `db.appMeta` exists as a table and is queryable (even if the row hasn't been created yet at this exact moment — see certification report §7 on when it populates).
- [ ] Book one test appointment and confirm it saves successfully with a real, non-`Date.now()`-based ID (any UUID-shaped string).
- [ ] Attempt to double-book the identical date/time/clinic slot from two different windows/tabs in quick succession; confirm exactly one succeeds and the other shows "This slot was just taken by another booking."
- [ ] Save a test consultation with the Chief Complaint field filled in; wait 30+ seconds without touching the form; confirm no visible interruption and no error.

## 5. Rollback verification (rehearse this BEFORE you need it for real)

- [ ] Confirm the previous build (pre-Module-A) is available to redeploy if needed.
- [ ] Confirm, per the certification report's evidence, that redeploying the previous build against an already-v50-upgraded database does not corrupt or hide existing patient/appointment/consultation data — the reverted code simply cannot see the new `appMeta` table, which is expected and harmless.
- [ ] Do NOT attempt to manually downgrade the Dexie schema version. Rollback is a code revert only; the database is left at v50 either way, which is safe (proven in `dbCertification.test.ts`).

## 6. Post-deployment verification

- [ ] Confirm `npm run build`'s `dist/` output is what was actually deployed (check a file hash or build timestamp if your deployment pipeline supports it).
- [ ] Confirm the background maintenance runtime starts (check for `[maintenance.run.start]`-style operational events in `operationalEvents`, or via the diagnostics panel) — this is what now enforces the outbox cap; if it never runs, the cap is never enforced.
- [ ] Confirm no console errors appear on first load in a real browser (not just the automated test suite) — Task 1's real-database validation gap means this manual check currently carries more weight than usual.

## 7. Doctor acceptance testing

To be performed by the doctor herself, on her own device, in a supervised session — not by an engineer pretending to be the doctor.

- [ ] Register a new test patient with a real-looking name/phone (delete afterward). Confirm it saves and the name/phone appear correctly in the patient list.
- [ ] Open a consultation for that patient, dictate or type into Chief Complaint, wait without touching the screen for about 30 seconds, then navigate away and back — confirm the text is still there (autosave working).
- [ ] Deliberately trigger a save failure if practical (e.g., airplane mode has no effect since this is fully offline-first, so this specific check may not be meaningfully triggerable by the doctor — note as N/A if so, rather than skipping silently).
- [ ] Book two appointments for the exact same date, time, and clinic in quick succession (two browser tabs, or ask a colleague to try at the same moment) — confirm one succeeds and the other shows a clear "already booked" message, not a silent failure or a duplicate booking.
- [ ] If an origin-mismatch banner ever appears during normal use (not expected under normal operation), confirm the doctor understands what it means and who to contact before dismissing it — do not let her learn this for the first time during a real incident.
- [ ] Confirm the doctor has actually made a backup export using the real workflow, on her real device, at least once, and knows where the file went.

## 8. Sign-off

- [ ] Engineering sign-off: all of §1–§6 checked.
- [ ] Doctor sign-off: all of §7 checked, in her own words that she understands what she just tested.
- [ ] Certification report's "Mandatory Preconditions Before Module B" are either satisfied or explicitly waived by whoever owns that decision — not silently skipped.
