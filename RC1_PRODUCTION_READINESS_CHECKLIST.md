# Sakhi Clinic — RC1 Production Readiness Checklist

Commit: `3914f643d8f32f170800ed24e757e65fe07417c3` (tag `v1.0.0-rc1`). Use this in order; do not skip a section because an earlier one looked fine. §1–§4 cover the certification pass specifically; §2a covers the broader RC1 feature set from `RC1_RELEASE_NOTES.md`. For what Module A already certified (data layer, migrations, outbox), see `MODULE_A_RELEASE_CHECKLIST.md`, which remains valid and is not superseded by this document.

---

## 1. Pre-deployment

- [x] `tsc --noEmit` clean — **[MEASURED]**, exit 0.
- [x] `npm run build` succeeds, `dist/` produced with PWA precache — **[MEASURED]**.
- [x] Full `vitest` suite passes — **[MEASURED]**, 429/429 across 49 files.
- [x] Full Playwright suite passes — **[MEASURED]**, 93/93 (24 pre-existing intentional desktop-only skips), stable across two consecutive runs with zero flakes.
- [x] Confirm the exact commit being deployed matches what these gates were run against — **[MEASURED]** commit `3914f64` is tagged `v1.0.0-rc1`; re-verify `git log -1` matches this exact hash before deploying.
- [ ] Module A's own pre-installation checklist (`MODULE_A_RELEASE_CHECKLIST.md` §1) is still satisfied — this pass did not touch the data layer and has no reason to invalidate it, but it should be re-confirmed, not assumed.

## 2. What the certification pass specifically verified (do not re-litigate, but do re-confirm on the deployed build)

- [ ] On a real mobile device (not just Playwright's device emulation), confirm the "Today" page shows the Command Center (hero card + queue chip strip + floating add button), not the old desktop queue panel.
- [ ] Confirm a first-visit consultation opens in Classic Mode and a follow-up consultation opens in Quick Mode, on a real device.
- [ ] Confirm the WhatsApp-share button works in both Classic and Quick modes on a real device (the testid fix in this pass only affects automated-test findability, not the button's actual function — worth a real click to confirm nothing regressed).

## 2a. What the broader RC1 release needs re-confirmed on a real device (full feature set — see `RC1_RELEASE_NOTES.md`)

The certification pass (§2) only re-verified test infrastructure around behavior that already existed. The features below were built earlier in the RC1 cycle and are covered by automated tests, but — like everything in this checklist — automated coverage is not a substitute for a real device confirmation before release:

- [ ] Backup & Restore: manual export/download, preview-before-restore, and (if configured) Google Drive connect/sync all work on a real device, not just in test doubles.
- [ ] Payment tracking: recording a payment in a consultation and seeing it reflected correctly in the Patient Ledger and Payment Dashboard, including partial/waived cases specifically (previously a real correctness bug, now fixed).
- [ ] Follow-up management: Completed/Cancelled statuses and the Cancel quick action behave as documented.
- [ ] Reminders: reminder history appears both on the Reminders page and on the Patient Ledger.
- [ ] Dashboard: Pending Reminders/Payments cards and deep-linked action cards navigate to the correct filtered views.
- [ ] AI remedy approval gate: confirm on a real device that no AI-suggested remedy is ever applied without explicit doctor approval.

## 3. Rollback

- [ ] The certification pass itself is trivially revertible: its changes are confined to `tests/` (5 files) and one attribute addition in `src/pages/ConsultationPage.tsx`, with no database migration or data-shape change.
- [ ] **`v1.0.0-rc1` is this project's first tagged release** — there is no prior stable tag to roll back to. If a rollback is needed after deployment, the practical plan is redeploying the last known-good build artifact (not a `git revert`, given the size of the feature work behind this tag), combined with restoring from a pre-upgrade backup per §4 if any data-affecting issue is suspected. Confirm this plan is actually in place (a retained previous build, not just a git ref) before deploying, not after.
- [ ] Module A's own rollback guarantees (`MODULE_A_RELEASE_CHECKLIST.md` §5) are unaffected by this pass.

## 4. Post-deployment verification

- [ ] Confirm `npm run build`'s `dist/` output is what was actually deployed.
- [ ] Confirm no new console errors appear on first load in a real browser — this pass's product-code change (one `data-testid` attribute) should be invisible to end users; any visible difference is worth investigating immediately as unexpected.
- [ ] Re-run `RC1_DOCTOR_UAT_PACKAGE.md` with the actual doctor on the actual deployed build, not a local dev build — automated tests in this pass ran against a local dev server, not production.

## 5. Doctor acceptance testing

See `RC1_DOCTOR_UAT_PACKAGE.md` for the full walkthrough (11 sections: patient registration, queue, first-visit/follow-up consultation modes, duplicate-booking protection, payments, follow-ups, reminders, dashboard, and backup/restore). **None of this has been performed with the actual doctor as part of this certification pass** — it is a precondition for release, not something already satisfied by the automated work above.

## 6. Known, disclosed gaps (not blockers for this pass's scope, but not silently resolved either)

- [ ] Real-device (not emulated/simulated) performance at 2000+ patients — **[UNTESTED]**, disclosed in `RC1_CERTIFICATION_REPORT.md` §6.
- [ ] True offline/service-worker behavior against a production build — **[UNTESTED]**, disclosed in `RC1_CERTIFICATION_REPORT.md` §5.
- [ ] Main JS bundle size (1.36 MB / 418 KB gzipped) — pre-existing, not addressed in this pass; a code-splitting effort is a legitimate future improvement, not an RC1 blocker.
- [ ] Documentation gap: the mobile UI's divergent testid namespace and Quick/Classic mode-default behavior is not yet written up anywhere durable — recommended in `RC1_CERTIFICATION_REPORT.md` §7, not yet actioned.
- [ ] All of Module A's own still-open preconditions (`MODULE_A_CERTIFICATION_REPORT.md` §7) remain open — this pass neither satisfies nor invalidates them.

## 7. Sign-off

- [ ] Engineering sign-off: §1–§4 (including §2a) checked.
- [ ] Doctor sign-off: `RC1_DOCTOR_UAT_PACKAGE.md` completed in full, in her own words that she understands what she tested.
- [ ] §6's disclosed gaps are either explicitly accepted by whoever owns that decision, or scheduled for a follow-up pass — not silently ignored.
