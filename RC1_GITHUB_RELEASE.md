# RC1 GitHub Release Package (draft — not yet published)

This is prepared content for a GitHub Release against tag `v1.0.0-rc1` (commit `3914f643d8f32f170800ed24e757e65fe07417c3`). Nothing has been published — `gh` CLI isn't available in this environment, and publishing a release is a visible, public action that needs your explicit go-ahead regardless. Use the sections below to create the release yourself (`gh release create v1.0.0-rc1 --title "..." --notes-file ...` or via the GitHub UI).

---

## 1. Release Title

**Sakhi Clinic RC1 — Engineering Certified**

---

## 2. Release Summary

Sakhi Clinic RC1 brings a redesigned backup & restore subsystem, dashboard, follow-up and reminder intelligence, payment tracking, and a from-scratch mobile "Command Center" queue experience — closed out with a full engineering certification pass that investigated and fixed every failing automated test rather than suppressing or skipping them.

**Major features delivered:**
- **Backup & Restore** — redesigned destination/mode/operations architecture, Google Drive sync via real PKCE OAuth, restore safety snapshots, preview-before-restore validation, automatic scheduled backups, and a plain-language Backup Health Dashboard.
- **Dashboard** — deep-linked action cards, Pending Reminders/Payments cards, Queue Intelligence panel, primary CTA kept above the fold on mobile.
- **Follow-up management** — a dedicated Follow-up Intelligence Dashboard with Completed/Cancelled statuses and a Cancel quick action.
- **Reminder system** — a WhatsApp Reminder Intelligence Engine with full scheduling, delivery, and analytics services, and reminder history surfaced directly on the Patient Ledger.
- **Payment tracking** — a Payment Tracker data model, in-consultation payment recording, a Payment Dashboard, and a corrected Patient Ledger for partial/waived payments.
- **Mobile improvements** — a purpose-built mobile "Command Center" Today/Queue page (not a resized desktop panel), safe-area-aware bottom navigation, viewport-agnostic navigation, and consultation modes (Classic for first visits, Quick for follow-ups) that adapt to clinical context.
- **Production hardening** — an AI remedy doctor-approval gate, an engineering certification pass that traced all 25 previously-failing mobile Playwright tests to root cause (zero were product defects — all test-infrastructure bugs, now fixed), and OAuth/serverless backend hardening.

**Quality metrics [MEASURED]:**
- TypeScript: clean (`tsc --noEmit`, exit 0)
- Unit/integration tests: **429/429 passing** across 49 test files (vitest)
- End-to-end tests: **93/93 passing**, 24 pre-existing intentional desktop-only skips (Playwright)
- Production build: succeeds, PWA precache generates correctly (12 entries, 1732 KiB)

**Testing summary:** every one of the 25 mobile Playwright failures found at the start of the certification pass was individually investigated against the actual product source before any test was changed. None were product defects — all were stale test assumptions (desktop-only selectors run against a redesigned mobile UI, tests not accounting for the intentional Classic/Quick consultation-mode default, an offline-simulation cleanup bug). One suspected layout defect (a button apparently overlapping the bottom nav on a Pixel-5 profile) was disproven with direct pixel measurement — the button never actually renders where the test thought it did. Full detail in the attached `RC1_CERTIFICATION_REPORT.md`.

---

## 3. Release Notes

See the attached **`RC1_RELEASE_NOTES.md`** for the full breakdown — it is already organized into exactly these sections and is the authoritative source; summarized here for the release body:

- **New Features:** Backup & Restore subsystem, Google Drive cloud backup, Follow-up Intelligence Dashboard, WhatsApp Reminder Intelligence Engine, Payment Tracking, Action Dashboard, AI remedy approval gate, mobile Command Center redesign.
- **Improvements:** intelligent consultation-mode defaulting, guaranteed safe-area bottom-nav padding, primary CTA kept above the fold on mobile, command palette/bottom-nav reconnection, viewport-agnostic navigation, same-tab refresh page persistence.
- **Bug Fixes:** Settings blank-screen bug, Android UUID/consultation crash, voice-dictation Android duplicate-transcript and overlap handling, OAuth token-exchange chain (6 related fixes), auto-backup fallback reactivity, IndexedDB rejection leaks, SettingsPage unmount-safety, and the 25 false-positive Playwright failures closed in the certification pass.
- **Performance:** dashboard data functions measured sub-linear at 500→2000 patients (3.8x cost for 4x data); correctness-at-scale proven for 4 workflow functions, not just speed.
- **Backup & Restore:** see New Features — 8 dedicated test files covering snapshot, preview, confirm, cancel, and failure-path behavior.
- **Testing:** 429/429 vitest, 93/93 Playwright, clean `tsc`, clean build — see `RC1_CERTIFICATION_REPORT.md` for full evidence.
- **Known Limitations:** no automatic off-device backup without Google Drive setup; no disaster recovery; real-device performance at 2000+ patients and true offline/service-worker behavior both untested in this pass; 1.36 MB main JS bundle; Settings/Cloud Backup automated coverage is desktop-only (feature itself works on mobile).
- **Upgrade Notes:** no schema/migration changes, no backup-format changes; take a manual backup before upgrading as standard practice.

---

## 4. Assets

The following four documents are verified suitable for attaching to the GitHub Release as-is (checked for balanced markdown, consistent commit/tag references, and internal cross-consistency — see `RC1_FREEZE.md` process notes for the validation performed):

| File | Purpose |
|---|---|
| `RC1_CERTIFICATION_REPORT.md` | Full engineering evidence: quality gates, Playwright investigation, UX/offline/large-dataset/documentation review, final verdict |
| `RC1_RELEASE_NOTES.md` | Full feature/fix/limitation breakdown for this release |
| `RC1_DOCTOR_UAT_PACKAGE.md` | Hands-on acceptance walkthrough for the doctor, covering every major feature area |
| `RC1_PRODUCTION_READINESS_CHECKLIST.md` | Deployment, rollback, and sign-off checklist |

No formatting changes were needed — all four were already well-formed markdown at the time of this review.

---

## How to actually publish this (when you're ready)

```bash
gh release create v1.0.0-rc1 \
  --title "Sakhi Clinic RC1 — Engineering Certified" \
  --notes-file RC1_GITHUB_RELEASE.md \
  RC1_CERTIFICATION_REPORT.md \
  RC1_RELEASE_NOTES.md \
  RC1_DOCTOR_UAT_PACKAGE.md \
  RC1_PRODUCTION_READINESS_CHECKLIST.md
```

The tag `v1.0.0-rc1` already exists locally and on `origin` (pointing at `3914f64`), so this command should target the existing tag rather than create a new one — adjust if your `gh` version requires `--target` or if the tag needs to be pushed first (`git push origin v1.0.0-rc1`).
