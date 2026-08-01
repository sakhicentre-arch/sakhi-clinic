# Google OAuth Deployment Checklist

An actionable runbook for deploying, verifying, and — if needed — rolling
back the Google Drive OAuth integration. For the full first-time Google
Cloud setup walkthrough, see `docs/GOOGLE_DRIVE_SETUP.md`. For how the
pieces fit together, see `docs/OAUTH_ARCHITECTURE.md`.

## Pre-deployment checklist

- [ ] Google Cloud project created, Drive API enabled (`docs/GOOGLE_DRIVE_SETUP.md` Steps 1–2)
- [ ] OAuth consent screen configured with the `drive.file` scope (Step 3)
- [ ] OAuth client created as **Web application**, with this deployment's
      real origin registered as both an authorized JavaScript origin and
      `<origin>/oauth/google/callback` as an authorized redirect URI (Step 4)
- [ ] Both the **Client ID** and **Client secret** copied from that OAuth client
- [ ] `VITE_GOOGLE_OAUTH_CLIENT_ID` set in Vercel (Production and/or Preview, as needed)
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET` set in Vercel, **without** a `VITE_` prefix,
      for the same environment(s)
- [ ] `tsc --noEmit`, `npm run build`, and the full test suite pass locally
      (this repo's current state: all pass — see the PR/commit this
      checklist ships with)

## Deploy steps

1. Push/merge the code. Vercel's zero-config detection deploys everything
   under `/api/**/*.ts` as Serverless Functions automatically — no
   `vercel.json` is required for this project.
2. Confirm both environment variables are set for the environment you're
   deploying to (Vercel dashboard → Project → Settings → Environment
   Variables). Setting them after the first deploy requires a **redeploy**
   to take effect — env var changes alone do not restart a live deployment.
3. Wait for the deployment to finish, then run the smoke tests below
   against that deployment's URL.

## Smoke test — health endpoint (do this first, before touching real OAuth)

```
GET https://<your-domain>/api/oauth/google/health
```

Expected when fully configured:

```json
{ "status": "ok", "oauthConfigured": true, "checks": { "clientIdConfigured": true, "clientSecretConfigured": true } }
```

If `oauthConfigured` is `false`, check `checks` to see which variable is
missing before doing anything else — this catches a missing/misspelled
env var or a deploy that predates setting it, without spending a real
Google consent attempt to find out. This endpoint never calls Google and
never returns either value, only booleans — safe to check from any
browser, no login required.

## Smoke test — full OAuth + backup flow

Only proceed once the health check above reports `oauthConfigured: true`.

1. Open the app, go to **Settings → Cloud Backup**. Confirm it reads
   "Google Drive" (not "not yet configured") and status "Not connected".
2. Click **Connect Drive** → complete Google's real consent screen →
   confirm redirect back to Settings with "Google Drive connected..."
   and status "Connected".
3. **Upload**: run **Export Backup**. Confirm a new file appears in the
   connected Google Drive account, and Settings → Cloud Backup history
   shows a `succeeded` job with a `verifying` stage.
4. **Restore**: use **Restore Backup** with a previously exported file (or
   the one just uploaded, downloaded back from Drive) and confirm the
   confirmation prompt shows the expected patient/consultation counts and
   the restore completes.
5. **Refresh + silent token refresh**: reload the page. Confirm Settings
   still shows "Connected" without asking you to sign in again. To
   specifically exercise the refresh path rather than just a still-valid
   access token, wait past the access token's expiry (or, for a faster
   check, inspect `sakhi.googleOAuth.tokens.v1` in DevTools →
   Application → Local Storage and confirm `expiresAt` updates to a new
   future timestamp after the next Drive operation).

## Failure-scenario tests

- **Remove the client secret temporarily** (Vercel → Environment
  Variables → delete or blank `GOOGLE_OAUTH_CLIENT_SECRET` → redeploy).
  - `GET /api/oauth/google/health` should now report
    `"oauthConfigured": false`, `"checks": {"clientSecretConfigured": false, ...}`.
  - Attempting Connect Drive should fail with a UI message ending in
    "Google Drive is not fully configured on the server." — never a raw
    stack trace or Google's internal wording.
  - Restore the real value and redeploy before continuing.
- **Simulate a revoked/expired grant**: revoke access from the test
  account's [Google Account permissions page](https://myaccount.google.com/permissions),
  then trigger a Drive operation. Confirm Settings shows "Authorization
  expired. Please reconnect Google Drive." (not a raw `invalid_grant` or
  a stack trace), and that **local backups still succeed** regardless —
  Drive failures never block the local backup pipeline.
- **Confirm no secret leakage**: check the `exchange`/`refresh`/`health`
  functions' logs in the Vercel dashboard (Deployment → Functions →
  select a function → Logs) after the tests above. Confirm you can see
  Google's real `error`/`error_description` for any failure (nothing is
  silently lost), but never a `client_secret`, access token, refresh
  token, authorization code, or PKCE verifier value anywhere in the log
  output.

## Rollback procedure

This change is additive and self-contained — no data migration, no schema
change, nothing stateful to unwind.

- **Fastest**: in the Vercel dashboard, find the previous known-good
  deployment and use "Promote to Production" (or equivalent) to roll back
  instantly, without touching the repository.
- **Via git**: `git revert` the relevant commit(s), or manually:
  1. Delete `api/oauth/google/exchange.ts`, `refresh.ts`, `health.ts`, `_shared.ts`.
  2. In `googleOAuthService.ts`, restore direct `fetch()` calls to
     `https://oauth2.googleapis.com/token` (this will only work again once
     you've also decided how to handle `client_secret` — see
     `docs/OAUTH_ARCHITECTURE.md`'s "Why a backend hop exists" if you're
     tempted to skip this).
  3. Redeploy.
- **Blast radius if something is wrong**: limited to Google Drive
  connect/reconnect/token-refresh. Local (on-device) backups, restore,
  `BackupManager`, `BackupJob`, and the rest of the app are on a
  completely separate code path and are unaffected either way.

## Troubleshooting quick reference

Full table with causes and fixes: `docs/GOOGLE_DRIVE_SETUP.md` →
Troubleshooting. Quick pointer by symptom:

| Symptom | Where to look |
|---|---|
| Health check shows `oauthConfigured: false` | Vercel env vars for the environment you're testing; redeploy after setting them |
| "Google Drive is not fully configured on the server." | `GOOGLE_OAUTH_CLIENT_SECRET` missing — same as above |
| "Authorization expired. Please reconnect Google Drive." | `invalid_grant` from Google — usually a stale/replayed PKCE attempt; just reconnect |
| "Google Drive configuration error." | `invalid_client`/`unauthorized_client` — client ID and secret don't match, or are from different Google Cloud projects |
| "Permission denied." | `access_denied` — doctor declined consent, or account isn't an approved test user yet |
| Anything else, or you need Google's exact original error | Vercel dashboard → the relevant function's logs → "Google rejected the request" (never swallowed, always logged there) |
