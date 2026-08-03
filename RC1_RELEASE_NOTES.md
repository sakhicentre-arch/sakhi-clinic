# Sakhi Clinic — RC1 Release Notes

**Base commit:** `4231dc2522b96c9435dffe9804e747f8b15ca8aa`, plus this session's Playwright test-infrastructure repair (see below).
**Date:** 2026-08-03

This release candidate contains **no new doctor-facing functionality** beyond what was already implemented at the base commit. This certification pass was scoped specifically to repairing test infrastructure and re-verifying quality gates — not adding features. The one product-code change in this pass is a testability-only attribute with zero behavior change (see below).

---

## What changed in this pass

### Fixed: Playwright test suite was reporting 25 false failures
The mobile test suite (4 device projects) was reporting 25 failures that did not reflect real product problems — all were investigated individually and traced to stale test assumptions, not product bugs:
- Two spec files still referenced the old desktop-style queue UI's element identifiers on mobile viewports, after the mobile "Command Center" queue redesign (FAB button, chip strip) had already shipped.
- Mobile consultation tests didn't account for a real, intentional product behavior: first-visit consultations default to full "Classic Mode" documentation, while follow-up visits default to the faster "Quick Mode" — a deliberate clinical-safety choice, not something the tests had been updated for.
- An offline-simulation test could leave the test browser stuck in a broken "offline" state after a failed reload attempt, causing unrelated follow-on assertions to fail for reasons that had nothing to do with the app.

None of these were product defects. The queue, consultation mode-switching, and WhatsApp-sharing all worked correctly the entire time — the tests were simply checking for the wrong things. All five root causes are now fixed; the suite runs clean (93 passed, 0 failed, 24 pre-existing intentional skips) across repeated runs with no flakiness.

### Added: a missing test hook (no behavior change)
The WhatsApp-share button in Classic Mode consultations now carries the same stable identifier its Quick Mode counterpart already had, so automated tests can find and verify it. The button's appearance, position, and behavior are unchanged — a doctor using the app will not notice any difference.

### Investigated and closed: a suspected mobile layout bug
One test failure — a "Register Patient" button appearing to overlap the bottom navigation bar on a Pixel-5-class device — was investigated with direct pixel measurements rather than assumed safe or assumed broken. It was confirmed **not** to be a real defect: the button lives inside its own scrollable form panel and is fully reachable by scrolling within that panel; it never actually renders behind the navigation bar. The test that flagged it has been corrected to check real on-screen visibility instead of raw coordinate math, which was the actual source of the false alarm.

---

## What did NOT change

- No new pages, workflows, or doctor-facing controls.
- No changes to how patients, consultations, appointments, or the queue behave.
- No changes to backup, restore, or sync behavior.
- No changes to clinical safety gates (AI remedy approval, duplicate-booking prevention, etc.) — all pre-existing behavior from the base commit, unmodified and re-verified still working.

---

## Quality gates for this release

- TypeScript: clean (`tsc --noEmit`, exit 0).
- Unit/integration tests: 429/429 passing across 49 test files (`vitest`).
- Production build: succeeds, PWA service worker precache generates correctly.
- End-to-end tests: 93/93 passing (24 additional tests are intentionally desktop-only by design and were skipped on mobile projects both before and after this pass).

See `RC1_CERTIFICATION_REPORT.md` for full evidence and `RC1_DOCTOR_UAT_PACKAGE.md` for what still needs a real doctor's hands before this is treated as release-ready.

## Known limitations carried forward (unchanged by this release)

- No automatic off-device backup unless Google Drive has been specifically configured for the deployment.
- No disaster recovery for a lost, reset, or corrupted device — a manual backup file made beforehand is the only recovery path.
- Real-device performance at large patient counts (2000+) has been measured only against a simulated database in automated tests, not a real phone's browser storage.
- True offline (no-network) behavior has not been verified against a production build with an active service worker in this pass.
