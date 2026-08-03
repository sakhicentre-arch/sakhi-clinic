# Sakhi Clinic — RC1 Production Readiness Checklist

Commit: `4231dc2522b96c9435dffe9804e747f8b15ca8aa` plus this session's Playwright fixes (see `RC1_RELEASE_NOTES.md`). Use this in order; do not skip a section because an earlier one looked fine. This checklist covers what changed in the RC1 certification pass — for what Module A already certified (data layer, migrations, outbox), see `MODULE_A_RELEASE_CHECKLIST.md`, which remains valid and is not superseded by this document.

---

## 1. Pre-deployment

- [x] `tsc --noEmit` clean — **[MEASURED]**, exit 0.
- [x] `npm run build` succeeds, `dist/` produced with PWA precache — **[MEASURED]**.
- [x] Full `vitest` suite passes — **[MEASURED]**, 429/429 across 49 files.
- [x] Full Playwright suite passes — **[MEASURED]**, 93/93 (24 pre-existing intentional desktop-only skips), stable across two consecutive runs with zero flakes.
- [ ] Confirm the exact commit being deployed matches what these gates were run against (the fixes in this pass are uncommitted at time of writing — commit them, then re-verify `git log -1` matches before deploying).
- [ ] Module A's own pre-installation checklist (`MODULE_A_RELEASE_CHECKLIST.md` §1) is still satisfied — this pass did not touch the data layer and has no reason to invalidate it, but it should be re-confirmed, not assumed.

## 2. What this pass specifically verified (do not re-litigate, but do re-confirm on the deployed build)

- [ ] On a real mobile device (not just Playwright's device emulation), confirm the "Today" page shows the Command Center (hero card + queue chip strip + floating add button), not the old desktop queue panel.
- [ ] Confirm a first-visit consultation opens in Classic Mode and a follow-up consultation opens in Quick Mode, on a real device.
- [ ] Confirm the WhatsApp-share button works in both Classic and Quick modes on a real device (the testid fix in this pass only affects automated-test findability, not the button's actual function — worth a real click to confirm nothing regressed).

## 3. Rollback

- [ ] If a rollback is needed, this pass's changes are entirely confined to `tests/` (5 files) and one attribute addition in `src/pages/ConsultationPage.tsx`. Reverting this pass's commit(s) requires no database migration and no data-shape change — it is a pure code revert, safe at any time.
- [ ] Module A's own rollback guarantees (`MODULE_A_RELEASE_CHECKLIST.md` §5) are unaffected by this pass.

## 4. Post-deployment verification

- [ ] Confirm `npm run build`'s `dist/` output is what was actually deployed.
- [ ] Confirm no new console errors appear on first load in a real browser — this pass's product-code change (one `data-testid` attribute) should be invisible to end users; any visible difference is worth investigating immediately as unexpected.
- [ ] Re-run `RC1_DOCTOR_UAT_PACKAGE.md` with the actual doctor on the actual deployed build, not a local dev build — automated tests in this pass ran against a local dev server, not production.

## 5. Doctor acceptance testing

See `RC1_DOCTOR_UAT_PACKAGE.md` for the full walkthrough. Summary: register a walk-in patient on mobile, add to queue, run through both a first-visit (Classic Mode) and follow-up (Quick Mode) consultation, confirm WhatsApp-share works in both, confirm duplicate-booking protection, and confirm the doctor has made and located a real backup file. **None of this has been performed with the actual doctor as part of this certification pass** — it is a precondition for release, not something already satisfied by the automated work above.

## 6. Known, disclosed gaps (not blockers for this pass's scope, but not silently resolved either)

- [ ] Real-device (not emulated/simulated) performance at 2000+ patients — **[UNTESTED]**, disclosed in `RC1_CERTIFICATION_REPORT.md` §6.
- [ ] True offline/service-worker behavior against a production build — **[UNTESTED]**, disclosed in `RC1_CERTIFICATION_REPORT.md` §5.
- [ ] Main JS bundle size (1.36 MB / 418 KB gzipped) — pre-existing, not addressed in this pass; a code-splitting effort is a legitimate future improvement, not an RC1 blocker.
- [ ] Documentation gap: the mobile UI's divergent testid namespace and Quick/Classic mode-default behavior is not yet written up anywhere durable — recommended in `RC1_CERTIFICATION_REPORT.md` §7, not yet actioned.
- [ ] All of Module A's own still-open preconditions (`MODULE_A_CERTIFICATION_REPORT.md` §7) remain open — this pass neither satisfies nor invalidates them.

## 7. Sign-off

- [ ] Engineering sign-off: §1–§4 checked.
- [ ] Doctor sign-off: `RC1_DOCTOR_UAT_PACKAGE.md` completed in full, in her own words that she understands what she tested.
- [ ] §6's disclosed gaps are either explicitly accepted by whoever owns that decision, or scheduled for a follow-up pass — not silently ignored.
