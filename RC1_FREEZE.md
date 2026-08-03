# Sakhi Clinic — RC1 Feature Freeze

**Tag:** `v1.0.0-rc1` | **Commit:** `3914f643d8f32f170800ed24e757e65fe07417c3` | **Date:** 2026-08-03

This document declares RC1 feature-frozen and defines what may still change before a real release, versus what moves to RC2. It was produced by reviewing the full commit history (83 commits), the current source tree, existing planning documents (`BETA_1.0_SCOPE_LOCK.md`, `MOBILE_DESIGN_BACKLOG.md`, `CONSULTATION_IMPLEMENTATION_AUDIT.md`), and the disclosed gaps already established in `RC1_CERTIFICATION_REPORT.md` and `RC1_PRODUCTION_READINESS_CHECKLIST.md` — not invented from scratch.

---

## Completed Features (RC1 scope, shipped and tested)

| Feature | Evidence |
|---|---|
| Backup & Restore subsystem (destination/mode/operations architecture, safety snapshots, preview-before-restore, scheduled auto-backup, Health Dashboard) | 8 dedicated test files, all passing |
| Google Drive cloud backup (PKCE OAuth, serverless proxy) | `docs/GOOGLE_DRIVE_SETUP.md`, `docs/OAUTH_ARCHITECTURE.md`, working end-to-end per `RC1_CERTIFICATION_REPORT.md` §5 |
| Follow-up Intelligence Dashboard | `followUpIntelligence.test.ts`, `followUpsNavigation.test.tsx` |
| WhatsApp Reminder Intelligence Engine | `reminderEngine.test.ts`, `remindersNavigation.test.tsx` |
| Payment Tracking + corrected Patient Ledger | `paymentService.test.ts` |
| Action Dashboard with deep-linked cards | `dashboardActionService.test.ts` |
| AI remedy doctor-approval gate | `consultationRubricApproval.test.tsx` |
| Mobile "Command Center" Today/Queue redesign | Verified via this certification pass's Playwright investigation |
| Consultation mode intelligence (Classic for first-visit, Quick for follow-up) | `RC1_CERTIFICATION_REPORT.md` §3, §4 |
| Voice dictation hardening (Android duplicate-transcript, overlap handling) | 7-commit hardening series, tagged "finalize release candidate architecture" |
| Module A: production data layer certification | `MODULE_A_CERTIFICATION_REPORT.md` (separate, still valid) |
| Engineering certification: 25/25 Playwright false-failures investigated and closed | `RC1_CERTIFICATION_REPORT.md` |

**Quality gates, all passing as of this tag:** `tsc` clean, `vitest` 429/429, `npm run build` succeeds, Playwright 93/93 (24 pre-existing intentional skips).

## Deferred Features (explicitly out of RC1 scope, not regressions)

Cross-referenced against `BETA_1.0_SCOPE_LOCK.md`'s original scope decisions — some have since shipped ahead of that document's schedule, noted below:

| Item | Original classification | RC1 status |
|---|---|---|
| Full patient timeline redesign | Beta 1.1 | Still deferred |
| Payment workflow | Beta 1.1 | **Partially delivered** — Payment Tracking + Patient Ledger shipped in RC1; a "full payment workflow redesign" (the original Beta 1.0 scope-lock's broader ambition) is not claimed as complete |
| Phone consultation workflow expansion | Beta 1.1 | Still deferred |
| Patient import/migration tooling | Future Release | Still deferred |
| Advanced AI automation beyond reviewable assistance | Non-goal | Still deferred — AI suggestions remain reviewable-only, gated by explicit doctor approval, by design |
| Large-scale analytics/reporting redesign | Non-goal | Still deferred |
| Disaster recovery (automatic, off-device) | Not in any prior scope document | Still deferred — disclosed plainly in `DOCTOR_OPERATIONAL_GUIDE.md` as "a separate, larger project (not yet built)" |
| Bundle size / code-splitting | Not previously scoped | Deferred — 1.36 MB main chunk is functional, not a blocker |

## Known Issues

Carried forward from `RC1_CERTIFICATION_REPORT.md` §8 and `RC1_PRODUCTION_READINESS_CHECKLIST.md` §6, restated here for freeze tracking — **none are classified as release blockers**, all are disclosed:

| Issue | Classification | Notes |
|---|---|---|
| Real-device (non-simulated) performance at 2000+ patients unverified | Technical Debt | Measured only against `fake-indexeddb` |
| True offline/service-worker behavior unverified against a production build | Technical Debt | Dev server used for certification has no active SW |
| No automatic off-device backup without Google Drive setup | Doctor Feedback (known, disclosed) | Documented plainly in `DOCTOR_OPERATIONAL_GUIDE.md`; not silently hidden |
| No disaster recovery | Doctor Feedback (known, disclosed) | Same as above |
| `MODULE_A_CERTIFICATION_REPORT.md` §7's still-open preconditions | Technical Debt | Unrelated to RC1's own work; neither satisfied nor invalidated by this release |
| `MOBILE_DESIGN_BACKLOG.md`'s 27 tracked mobile issues (0 critical, 18 high-priority per its own classification) | Technical Debt — **status unverified against current code** | Predates much of RC1's mobile redesign work; needs a fresh pass to determine which are already resolved before it can be trusted as current |

## Technical Debt

- **`ConsultationPage.tsx` is 3600+ lines**, per `CONSULTATION_IMPLEMENTATION_AUDIT.md` — flagged there as desktop-first architecture adapted to mobile rather than redesigned for it. A real, disclosed structural concern; not addressed in RC1 (out of scope: no refactoring without a release-blocking reason).
- **Main JS bundle is 1.36 MB** (418 KB gzipped) — no code-splitting yet.
- **Mobile UI's divergent testid namespace and Quick/Classic mode-default behavior is undocumented** anywhere durable — this exact gap caused the 25 false-positive Playwright failures investigated in this certification pass. Recommended fix: a short section in `TESTING_GUIDE.md`.
- **`tsconfig.json` only includes `src`** — `tests/` is not type-checked by `tsc --noEmit`. Playwright transpiles test files itself (esbuild), so this isn't a build risk, but it means test-file type errors and unused-import drift aren't caught by the same gate `src/` gets. Not fixed in this pass (a `tsconfig` change is a build-config change, not documentation).
- **`MOBILE_DESIGN_BACKLOG.md` needs a fresh audit pass** against current code before its 27 items can be trusted as an accurate current-state backlog (see Known Issues above).
- **OAuth/serverless backend required 6 sequential hardening commits in one day** (`4f205e6` through `d6a743c`) to reach a working state, including a temporary diagnostic probe that was added and then correctly removed once root-caused. Worth a retrospective on why the initial serverless migration needed that much iteration, purely to prevent repeat churn on the next serverless integration — not a current defect.

## Future Enhancements

See `VISION_RC2.md` for the full, organized backlog. Not detailed here to avoid duplicating that document.

## Acceptance Criteria for RC1 (this freeze)

RC1 is considered genuinely frozen and ready for Doctor UAT when all of the following hold:

- [x] All automated quality gates pass (`tsc`, `vitest`, Playwright, `npm run build`) — **[MEASURED]**, confirmed at this tag.
- [x] Certification documentation is internally consistent (commit/tag references, feature claims cross-checked against source) — **[MEASURED]**, corrected in this freeze pass (see `RC1_CERTIFICATION_REPORT.md`, `RC1_RELEASE_NOTES.md` revision history).
- [x] Repository hygiene audit passed — no debug code, diagnostics, TODOs, dead code, or generated artifacts pending commit.
- [ ] `RC1_DOCTOR_UAT_PACKAGE.md` completed by the actual doctor, on her actual device — **not yet performed**, the single largest remaining precondition.
- [ ] All Known Issues above are either explicitly accepted by whoever owns that decision, or scheduled — not silently ignored.

---

## Rules After Freeze

Effective immediately at this tag. Only the following may still be changed before release:

- **Critical bugs** — anything that crashes the app, corrupts data, or blocks a core clinical workflow entirely.
- **Security issues** — anything exposing patient data or credentials improperly.
- **Data integrity issues** — anything that could silently lose, duplicate, or corrupt patient/consultation/appointment/payment records.
- **Backup failures** — anything that makes the doctor's manual backup/restore path (the only real safety net today) unreliable.
- **Doctor workflow blockers** — anything that prevents the doctor from completing a routine clinical task (registering a patient, running a consultation, booking an appointment) at all, not merely imperfectly.

**Everything else — including every item in Deferred Features, Known Issues, and Technical Debt above — moves to RC2.** No new functionality, no non-blocking refactors, no "while I'm in there" improvements until RC2 planning explicitly picks them up.
