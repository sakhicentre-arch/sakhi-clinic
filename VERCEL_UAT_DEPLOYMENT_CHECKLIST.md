# Vercel Doctor-UAT Deployment Readiness Checklist

Scope: prepare the already-verified build (post `DOCTOR_UAT_READINESS_REPORT.md`) for a **controlled Doctor UAT deployment** on Vercel — not final production. No application functionality was changed to produce this document. Exactly one deployment-configuration file was added (`vercel.json`, explained in §4) because it was found to be genuinely required, not speculative.

---

## 1. Build configuration

- **Build command**: `npm run build` → `vite build`. Confirmed working (see §9 below).
- **Output directory**: `dist/` (Vite default, not overridden anywhere in `vite.config.ts`). Vercel's zero-config Vite framework preset auto-detects both the build command and output directory correctly — no `vercel.json` `buildCommand`/`outputDirectory` override is needed.
- **Node version**: not pinned anywhere (`package.json` has no `engines` field, no `.nvmrc`, no `vercel.json` `functions.runtime`). Vercel will use its current default Node LTS for both the static build and the `/api` serverless functions. This is a minor gap worth closing eventually (pin a version so a future Vercel default-bump can't silently change build behavior) but is **not a UAT blocker** — the build and functions both ran successfully against whatever Node version this session's local toolchain resolved to, and Vercel's current default LTS is what real doctors would also get.
- **Serverless functions**: `api/oauth/google/{health,exchange,refresh}.ts` deploy automatically as Vercel Functions — no `vercel.json` `functions` block needed (Vercel's Node.js builder compiles `.ts` under `/api` natively, confirmed by `api/tsconfig.json`'s own header comment, which explicitly documents that Vercel reads the **root** `tsconfig.json`, not this one, for the actual deployed compile). `api/oauth/google/_shared.ts` is correctly excluded from becoming its own route by Vercel's underscore-prefix convention.
- **PWA build output**: `vite-plugin-pwa` generates `dist/sw.js` and a workbox chunk at build time (confirmed in this session's build output: "PWA v1.3.0 ... precache 14 entries"). No Vercel-specific configuration is needed for this — it's a static asset like any other.

## 2. Environment variables

Two variables total, both already correctly named and scoped in the existing codebase (verified, not assumed):

| Variable | Where it's read | Prefix rule | Required for UAT? |
|---|---|---|---|
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | `googleOAuthService.ts` (client-side, `import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID`) | Correctly `VITE_`-prefixed — Vite inlines this into the public JS bundle at build time, which is safe because an OAuth **client ID** is not a secret (it's already visible in the browser's own outgoing auth-redirect URL). | Only if Google Drive backup is in scope for this UAT round. If unset, Settings shows Drive as honestly "not configured" and local backups continue to work — this is a supported, tested state, not a broken one. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `api/oauth/google/_shared.ts`'s `requireClientSecret()`, used only by `exchange.ts`/`refresh.ts` | Correctly **un**-prefixed — confirmed by direct code read that no `VITE_`-prefixed variable anywhere carries a secret value, and this one is read only via `process.env` inside serverless functions, never bundled into client JS. | Required **only if** the row above is set — Google's Web-application OAuth client type requires this secret on every token exchange even with PKCE. |

**No other environment variable is read anywhere in `src/` or `api/`** — confirmed by grepping the whole codebase for `import.meta.env`/`VITE_`, not assumed from documentation alone. `.env.example`'s two commented-out extras (`VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_NAME`) are explicitly dead — the file's own comments confirm no code path reads them, and this audit did not find any either.

**Secret-leak check (verification, not assumption)**:
- `.gitignore` correctly excludes `.env`, `.env*`, and `.vercel`.
- `git log --all --full-history` for `.env`, `.env.local`, `.env.production` returns **zero commits** — these files were never committed at any point in this repo's history, not just currently ignored.
- Only `.env.example` (containing no real values, all blank) is tracked in git.
- A `.env.local` file exists on this local machine's disk (used for local dev) but is untracked and was never part of any commit — confirmed via `git ls-files`.
- **Client-side (`VITE_*`) variable content check**: the one `VITE_`-prefixed variable in use, `VITE_GOOGLE_OAUTH_CLIENT_ID`, contains no private secret by its nature (OAuth client IDs are public identifiers, not credentials) — this satisfies checklist requirement #5 directly, not by omission.

## 3. OAuth requirements (Google Drive backup)

Production callback/redirect requirements, read directly from `getRedirectUri()` in `googleOAuthService.ts`:

```
redirect_uri = `${window.location.origin}/oauth/google/callback`
```

This is computed **dynamically from whatever origin actually served the page** — there is nothing to hardcode in code for a new deployment URL. What must be done in **Google Cloud Console** for each URL doctors will actually use during UAT:

- [ ] Add the UAT deployment's exact origin (e.g. `https://sakhi-clinic-git-uat-<team>.vercel.app`, or whatever alias is used) as an **Authorized JavaScript origin**.
- [ ] Add `<that same origin>/oauth/google/callback` as an **Authorized redirect URI** — exact scheme/host/port, no trailing slash (per `docs/GOOGLE_DRIVE_SETUP.md` Step 4, already correct in this repo's existing documentation).
- [ ] If the UAT doctor's Google account isn't already an approved test user and the OAuth consent screen is still in "Testing" publish status, add that account under **OAuth consent screen → Test users**.
- [ ] Set `VITE_GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in Vercel for the environment this UAT deployment runs in (Preview or Production, matching whichever URL was registered above).

**This is a per-URL requirement, not a one-time setup.** A Vercel Preview deployment typically gets a different URL per branch/PR than a Production alias — if the UAT URL changes between rounds, Google Cloud Console's authorized origin/redirect list must be updated to match, or Connect Drive will fail with `redirect_uri_mismatch`. Decide the UAT URL **before** doing the Google Cloud Console setup step, not after.

**If Google Drive backup is not needed for this UAT round**: skip all of the above entirely. The app is fully functional with local-only backups when these variables are unset — this is a genuinely supported configuration per `.env.example`'s own documentation, not a degraded one.

## 4. Routing requirements

This app does **not** use a client-side router for its main navigation — `App.tsx` swaps pages via a plain `useState`, not URL paths, so the vast majority of the app (Today, Patients, Consultation, Settings, etc.) is unaffected by routing/rewrite concerns; it's all one path (`/`).

**Two exceptions exist that ARE real, separate paths and DO need to survive a direct load/refresh:**

1. `/review` — a standalone post-visit review-request page, reached via `window.location.pathname === "/review"` in `App.tsx`, no `AppShell` wrapper.
2. `/oauth/google/callback` — the Google OAuth redirect target (`GOOGLE_OAUTH_CALLBACK_PATH` in `completeGoogleDriveConnection.ts`), which Google's own consent flow redirects the browser to directly (a real, full-page navigation, not an in-app link).

**Finding, and the one configuration change made in this pass**: Vercel's zero-config static/Vite deployment does not guarantee that an arbitrary sub-path like `/review` or `/oauth/google/callback` resolves to `index.html` on a direct load or hard refresh — without an explicit rewrite, an unmatched path returns Vercel's own 404 page instead of booting the SPA, which would silently break both the Google OAuth callback (breaking Drive Connect entirely) and the `/review` link. **A minimal `vercel.json` was added**:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
This is the standard, minimal SPA-fallback pattern Vercel itself documents. It does not affect `/api/**` routes or any static asset (`manifest.webmanifest`, icons, `sw.js`, `robots.txt`) — Vercel resolves an actual file or serverless function match **before** applying a rewrite, so this is additive-only and was verified not to change the production build output (see §9). This addition should still be smoke-tested against the real deployed URL (§8), since this session has no way to exercise an actual Vercel deployment directly.

**Separately discovered, NOT fixed in this pass (out of scope — this is a config-only pass, not a functionality change), and worth flagging clearly before UAT:**

`src/pages/ReviewPage.tsx` calls `useSearchParams()` from `react-router-dom`, but **no `<Router>` of any kind wraps any part of this app** (`main.tsx`/`App.tsx` have zero `react-router-dom` imports). React Router's hooks throw at runtime when called outside a Router context. No test in the suite renders `ReviewPage` (confirmed by search — the one file matching "ReviewPage" in `src/__tests__` is `rubricReviewPage.test.tsx`, an unrelated screen with a similar name), so this defect has never been caught by the existing 678-test suite and predates this deployment pass entirely. **Practical effect: visiting `/review` on the deployed UAT build will very likely throw a runtime error instead of showing the review-request page.** Recommend either excluding `/review` from this UAT round's test scope, or requesting a small, separately-approved one-file fix (e.g. reading `window.location.search` directly instead of `useSearchParams()`) before doctors are asked to use that specific feature. This does not affect any core clinical workflow (patients, consultations, prescriptions, backup) — it is isolated to the post-visit review-request page only.

## 5. Security checks

- [x] No secret is committed to the repository (verified via git history search, not just current `.gitignore` state — see §2).
- [x] `GOOGLE_OAUTH_CLIENT_SECRET` is read only server-side (`api/oauth/google/_shared.ts`), never sent to the browser, never logged (confirmed by direct code read of `_shared.ts`'s logging calls — every log statement takes only named, whitelisted, non-secret fields).
- [x] Google's OAuth errors are translated to safe, doctor-facing messages before reaching the browser (`safeMessageFor()`); the original error is preserved only in server-side Vercel function logs.
- [x] No `VITE_`-prefixed variable carries a secret (only one exists, and it's a public client ID by nature — see §2).
- [ ] **Not yet configured, and not a UAT blocker**: no rate limiting on the OAuth serverless endpoints (a pre-existing, already-documented, accepted risk per `docs/GOOGLE_DRIVE_SETUP.md`'s own Security notes — low-traffic internal tool, both endpoints require an unguessable PKCE verifier or refresh token regardless).
- [x] HTTPS is enforced automatically by Vercel for every deployment (Preview and Production both get a `*.vercel.app` HTTPS URL, or an HTTPS custom domain) — nothing to configure.

## 6. Data persistence checks

- **IndexedDB under HTTPS**: Vercel serves every deployment over HTTPS by default (no plain-HTTP option exists for a Vercel-hosted app), and IndexedDB/localStorage/Service Workers all function normally under HTTPS — this is in fact a *precondition* the PWA (`vite-plugin-pwa`) already assumes, not a new requirement introduced by this deployment. No configuration is needed for this to work; it works because Vercel's default hosting already satisfies it.
- **Per-deployment-URL data isolation**: browser storage (IndexedDB, localStorage) is scoped to the serving origin. If the UAT URL changes between rounds (e.g. a new Preview URL per branch), doctors will **not** see data entered under a previous UAT URL — this is normal browser behavior, not a bug, but worth stating explicitly so it isn't mistaken for data loss during UAT. Recommend settling on one stable UAT URL (a Vercel alias/custom domain, not a per-commit Preview URL) for the duration of the UAT round specifically to avoid this.
- **Service worker caching**: `vite-plugin-pwa`'s `navigateFallback: '/index.html'` and its explicit comment ("Do NOT cache IndexedDB data or API responses") confirm clinical data itself is never cached by the service worker — only the app shell (JS/CSS/HTML) and images are. A stale cached app shell after a redeploy is the only realistic caching risk, and `registerType: 'autoUpdate'` already mitigates it by design.

## 7. Backup/sync checks

- **Local (on-device) backups**: entirely client-side (IndexedDB export/import), no server dependency at all — unaffected by any Vercel deployment detail.
- **Google Drive backup**: depends only on the two OAuth env vars (§2/§3) and the SPA-fallback rewrite (§4) for its callback path to load correctly. No other deployment-specific configuration exists for it.
- **Sync architecture**: confirmed via `git status` that **no file under `src/services/sync/` was modified** in this pass or the preceding implementation pass — `SyncEngine`, `SyncProvider`, the provider registry, `GoogleDriveSyncProvider`, the encryption/key-envelope architecture, and cursor architecture are all byte-for-byte unchanged. This deployment pass touched exactly one file relevant to backup/sync adjacent code (`vercel.json`, a routing config file, not sync logic), and one pre-existing OAuth doc set was read but not edited.
- **This document does not claim a real Google Drive OAuth round-trip has been executed against a live deployment** — it hasn't. §8 below defines exactly that as a required post-deployment smoke test, to be run for real once a UAT URL exists, not assumed from code review.

## 8. Doctor UAT URL requirements

- [ ] Decide the UAT URL **before** doing any Google Cloud Console setup — a stable Vercel alias or custom domain is strongly recommended over a per-commit Preview URL, both to avoid the data-isolation confusion in §6 and to avoid re-doing the Google Cloud Console origin/redirect-URI registration every time a new commit is pushed.
- [ ] If deploying to a Vercel **Preview** environment (not Production) for this UAT round, confirm the two OAuth env vars (if used) are set for the **Preview** environment specifically in Vercel's dashboard — Vercel scopes env vars per-environment, and a variable set only for Production will not be visible to a Preview deployment.
- [ ] Share the UAT URL with the doctor only after §9's local checks and the §10 post-deployment smoke test both pass.

## 9. Post-deployment smoke test

Run these against the **real deployed UAT URL**, not localhost, after the deployment finishes:

1. Load the root URL. Confirm the app boots (Dashboard or Today page), no console errors, no visible dark-mode color inversion (the Finding-0 fix from the prior pass should already show the intended light theme).
2. **Hard-refresh** while on a non-root in-app "page" (e.g. Patients) — since routing is state-based, this will reset to the default page (Dashboard/Today), which is expected, not a bug.
3. **Directly load** `<uat-url>/review` (paste the URL, don't navigate via a link) and confirm it loads the app shell rather than a Vercel 404 — this specifically tests the `vercel.json` rewrite added in §4. (Separately: see §4's disclosed `useSearchParams` finding — the page loading its shell without a 404 does not guarantee the page itself won't then throw; check the browser console.)
4. **Directly load** `<uat-url>/oauth/google/callback` with no query parameters (simulating a stale/incomplete redirect) and confirm it does not show a raw Vercel 404 — it should load the app shell and handle the missing params gracefully (per `completeGoogleDriveConnection.ts`'s existing error handling, unchanged in this pass).
5. If Google Drive is configured for this UAT round: `GET <uat-url>/api/oauth/google/health` and confirm `{"status":"ok","oauthConfigured":true,...}` **before** attempting a real Connect Drive — this is `docs/OAUTH_DEPLOYMENT_CHECKLIST.md`'s own first smoke test and remains the correct first step.
6. If Google Drive is configured: complete a real Connect Drive flow once, run one Export Backup, and confirm the file appears in the connected Drive account — the one genuinely new integration point (§4's rewrite) sits directly in this path.
7. Register a test patient, confirm no duplicate-warning false-positive against seed/demo data, run one full consultation through Save & Next, confirm it does not dead-end back to Today when another patient is queued (the fix from the prior implementation pass) — this is the highest-value single smoke test since it exercises patient creation, consultation, prescription, and queue state together.
8. Confirm the bottom nav, patient header, and prescription dosage picker render correctly on an actual mobile device (not just the emulated viewports this pass's Playwright run used) — real-device rendering has not been verified in either this pass or the prior one.

## 10. Known limitations

- `/review`'s `useSearchParams()`-without-a-Router defect (§4) — pre-existing, not introduced by this pass, not fixed by this pass (out of scope for a configuration-only audit).
- No Node version pinned for the Vercel build/functions (§1) — low risk, not a blocker, worth closing separately.
- No rate limiting on the OAuth serverless endpoints — pre-existing, already documented, accepted risk for a low-traffic internal tool.
- Real-device (non-emulated) mobile rendering has not been verified against an actual deployed HTTPS URL by this pass — only against a local dev server and headless Playwright viewports.
- A live Google Drive OAuth round-trip against a real deployed URL has not been executed by this pass — §9 defines it as a required post-deployment step, not something this document can claim has already passed.
- This checklist inherits every "remaining known issue" already disclosed in `DOCTOR_UAT_READINESS_REPORT.md` §2–3 (the sibling native-`<select>` dosage surface, the broader workflow-redesign document not implemented, etc.) — none of those are deployment concerns, so they aren't repeated in full here, but they remain true of this build.

---

## 11. Verification run for this pass

```
npx tsc --noEmit     — see result below
npm test             — see result below
npm run build        — see result below
```

Results are reported in the accompanying message, not duplicated here, to keep this checklist a stable reference rather than a timestamped log.
