# Google Drive Backup — Production Setup

This is the complete, one-time configuration needed to turn on Google Drive
as a backup destination. No further code changes are required to complete
this — the integration (`src/services/backup/oauth/googleOAuthService.ts`,
`src/services/backup/providers/googleDriveProvider.ts`, and the two
token-proxy serverless functions `api/oauth/google/exchange.ts` and
`api/oauth/google/refresh.ts`) is already built and wired into the app; it
is just inert until a real OAuth client exists.

Until this is done, the app is fully functional with **local (on-device)
backups only** — see `DOCTOR_OPERATIONAL_GUIDE.md`. Nothing below is
required to use Sakhi Clinic.

## What you're setting up

Sakhi Clinic uses OAuth 2.0 **Authorization Code + PKCE** — the flow Google
recommends for a browser-only single-page app. PKCE lets a public client
(like a browser) skip a client secret *in the generic OAuth spec* — but
Google's own implementation does not extend that exemption to a **Web
application** client type (the type this app uses, since it needs an
arbitrary hosted HTTPS redirect URI, which is only supported by that type).
Google's token endpoint requires `client_secret` on every token request for
a Web application client regardless of PKCE. Because that secret must never
reach the browser, it is held only by two small serverless functions —
`api/oauth/google/exchange.ts` (authorization code → tokens) and
`api/oauth/google/refresh.ts` (refresh token → new access token) — split by
grant type rather than one endpoint that branches, so each contains only
the logic its own request actually needs. These are the *only* parts of
this flow that aren't client-side. Everything else (the PKCE
verifier/challenge, the redirect to Google, the callback) still happens
entirely in the browser exactly as a pure-PKCE flow would, and
`googleOAuthService.ts` is the only file that knows these two endpoint
paths exist — nothing else in the app, including the UI, ever references
them directly.

The requested scope is `https://www.googleapis.com/auth/drive.file` —
Google's most restrictive Drive scope. It only grants access to files this
app itself creates; it can never see, list, or touch the doctor's other
Drive files.

## Step 1 — Create (or choose) a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Create a new project (or use an existing one dedicated to this
   deployment). Note the project name — it does not need to match
   "Sakhi Clinic".

## Step 2 — Enable the Drive API

1. In the project, go to **APIs & Services > Library**.
2. Search for **Google Drive API** and click **Enable**.

## Step 3 — Configure the OAuth consent screen

1. **APIs & Services > OAuth consent screen**.
2. User type: **External** (unless every doctor using this deployment has
   an account in the same Google Workspace organization, in which case
   **Internal** is simpler and skips Google's verification review).
3. App name: `Sakhi Clinic` (or your deployment's name). This is what the
   doctor sees on Google's consent screen — it is unrelated to any env
   variable.
4. Scopes: add `.../auth/drive.file`.
5. Test users (External + "Testing" publish status only): add every
   doctor's Google account that needs to connect Drive before the app is
   verified. Unverified apps in Testing mode work fine for a small,
   known set of accounts — verification is only required to let
   *arbitrary* Google accounts connect, which this deployment likely
   never needs.

## Step 4 — Create the OAuth client ID

1. **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins**: add every origin this app is served
   from, e.g.:
   - `https://your-production-domain.example`
   - `http://localhost:5173` (Vite dev server, if doctors or developers
     will ever connect Drive from a local dev build)
4. **Authorized redirect URIs**: add `<origin>/oauth/google/callback` for
   every origin above, e.g.:
   - `https://your-production-domain.example/oauth/google/callback`
   - `http://localhost:5173/oauth/google/callback`

   This exact path is hardcoded on both ends of the flow —
   `googleOAuthService.ts`'s `getRedirectUri()` and
   `completeGoogleDriveConnection.ts`'s `GOOGLE_OAUTH_CALLBACK_PATH` — so
   it must match Google Cloud Console exactly, including scheme and lack
   of trailing slash.
5. Save. Copy **both** values Google shows you: the **Client ID** (looks
   like `123456789-abc...apps.googleusercontent.com`) and the **Client
   secret**. Unlike the general PKCE guidance you may have read elsewhere,
   this app's Web application client type *does* need the secret — see
   "What you're setting up" above.

## Step 5 — Set the environment variables

**Client ID (build-time, client-side):** copy `.env.example` to `.env` (or
`.env.local`, or your hosting provider's build-time environment variable
UI) and set:

```
VITE_GOOGLE_OAUTH_CLIENT_ID=123456789-abc...apps.googleusercontent.com
```

Rebuild/redeploy (`npm run build`). Vite inlines `VITE_`-prefixed
variables at build time — changing this value requires a rebuild, not
just a server restart.

**Client secret (runtime, server-side only):** in your Vercel project's
**Settings > Environment Variables**, add:

```
GOOGLE_OAUTH_CLIENT_SECRET=<the client secret from Step 4>
```

Do **not** prefix this with `VITE_` and do **not** put a real value in any
committed file — a `VITE_` prefix would bake it straight into the public
JS bundle, defeating the entire point of the serverless proxy. This
variable is read only by `api/oauth/google/exchange.ts` and
`api/oauth/google/refresh.ts`, at request time, on Vercel's servers; it is
never sent to the browser and never logged. One secret covers both
endpoints (and would cover any future Google integration too — see
"Why one shared env var, not per-feature ones" below). Set it for
whichever Vercel environments you use (Production/Preview/Development) and
redeploy — Vercel Serverless Functions read `process.env` at request time,
so no rebuild of the frontend bundle is required for this one, but a
redeploy is still needed for a brand-new environment variable to become
visible to the function at all.

### Why one shared env var, not per-feature ones

If Sakhi Clinic ever adds Calendar, Gmail, or Contacts integration, the
natural Google Cloud Console approach is to add scopes to this *same*
OAuth client, not create a separate client per Google product — one
consent screen, one client, one secret, and the doctor only has to grant
access once. `GOOGLE_OAUTH_CLIENT_SECRET` (and `VITE_GOOGLE_OAUTH_CLIENT_ID`)
are named for what they actually are — this app's Google OAuth client
credentials — rather than `GOOGLE_DRIVE_CLIENT_SECRET`, which would become
misleading (and would need renaming again) the moment a second feature
starts using the same client. If a genuinely separate OAuth client is ever
needed for an unrelated integration, name that pair for what *it* is at
that time.

`VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_NAME` (sometimes seen in
Google quick-start templates) are **not used anywhere in this codebase**
and do not need to be set — see the comments in `.env.example` for why.

## Step 6 — Verify it took effect

1. Open the app, go to **Settings > Cloud Backup**.
2. It should now read **"Google Drive"** (not "not yet configured for
   this deployment") and the status pill should read **"Not connected"**
   (not "Not configured").
3. Click **Connect Drive**. You should be redirected to a real
   `accounts.google.com` consent screen, showing your configured app
   name and the `drive.file` scope.
4. After granting consent, you're redirected back to
   `/oauth/google/callback`, then automatically back to `/` and Settings,
   with a note: *"Google Drive connected. New backups will now save to
   Drive."* The status pill should now read **"Connected"**.
5. Run **Export Backup**. Check the Google Drive account you connected —
   a file named per `makeBackupFilename()`'s convention should appear.
6. Check **Settings > Cloud Backup > Cloud backup history** — a
   `succeeded` job should be listed with a `saving` stage event and
   (if `getMetadata`/checksum data is available) a `verifying` stage
   showing `Verification passed`.

If any of this doesn't happen, see **Troubleshooting** below before
assuming the app is broken — most failures at this stage are a
mismatched redirect URI or an OAuth consent screen still in "Testing"
mode without the doctor's account added as a test user.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Settings still shows "not yet configured" after setting the env var | Rebuild didn't happen, or the var name is misspelled | Confirm `VITE_GOOGLE_OAUTH_CLIENT_ID` exactly, then `npm run build` again. Vite bakes this in at build time. |
| Clicking Connect Drive shows Google's `redirect_uri_mismatch` error | The authorized redirect URI in Google Cloud Console doesn't exactly match `<origin>/oauth/google/callback` | Re-check Step 4 — scheme, host, port, and path must match exactly, no trailing slash. |
| Google shows "Access blocked: this app's request is invalid" or "app not verified" and refuses the doctor's account | Consent screen is in Testing mode and the doctor's account isn't a test user (or app is External and needs verification for broader use) | Add the account under OAuth consent screen > Test users, or submit for verification if you need unrestricted access. |
| Consent succeeds but Settings shows "Could not connect Google Drive: Google token exchange failed (500): Google Drive is not fully configured on the server" | `GOOGLE_OAUTH_CLIENT_SECRET` isn't set on the Vercel deployment (or wasn't redeployed after setting it) | Set it under Vercel > Settings > Environment Variables for the environment you're testing (Production/Preview), then redeploy. |
| Settings shows a message like "Authorization expired. Please reconnect Google Drive." | This is the intentional, safe, doctor-facing translation of Google's `invalid_grant` — usually a PKCE verifier mismatch (starting the flow in one browser/profile and completing it in another, browser storage cleared mid-flow, or the callback running twice for the same code) | Just reconnect — click Connect Drive again from the same browser session. Google's exact original `error`/`error_description` is never lost; it's in `api/oauth/google/exchange.ts`'s (or `refresh.ts`'s) server-side logs in the Vercel dashboard, under "Google rejected the request". |
| Settings shows "Google Drive configuration error." | Google's `invalid_client`/`unauthorized_client` — the client ID and secret don't match, or belong to different Google Cloud projects | Re-check that `VITE_GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` came from the *same* OAuth client in Step 4. Check the exchange/refresh function's Vercel logs for Google's exact error. |
| Settings shows "Permission denied." | Google's `access_denied` — the doctor declined consent, or their account isn't an approved test user yet | Add the account under OAuth consent screen > Test users if the app is still in Testing mode, then try Connect Drive again. |
| Upload fails with a 401/403 shortly after connecting | Access token expired and no refresh token was issued (can happen if `access_type=offline` consent wasn't re-prompted) | Disconnect and reconnect Drive — `getAuthUrl()` already requests `access_type=offline&prompt=consent` so a fresh connect always issues a refresh token. |
| Everything above looks right and it still fails | Check Settings > Cloud Backup > Cloud backup history for the failed job's stage/message, the browser console/network tab for the actual response from `/api/oauth/google/exchange` or `/refresh`, and that function's server-side logs in the Vercel dashboard | The failure reason is categorized (`auth`, `quota`, `network`, etc. — see `categorizeError` in `backupManager.ts`) and shown per-job; Google's original error is logged server-side, never swallowed, even though the browser only ever sees the safe translated message. |

## Security notes

- No credential is ever committed to this repository. `.env` is
  git-ignored (see `.gitignore`). `GOOGLE_OAUTH_CLIENT_SECRET` lives only
  in Vercel's environment variable store, never in a file in this repo.
- `api/oauth/google/exchange.ts` and `refresh.ts` are the only places
  `GOOGLE_OAUTH_CLIENT_SECRET` is ever read (both via the shared
  `_shared.ts`, itself not deployed as a route — Vercel excludes any
  `/api` file prefixed `_`). Each adds the secret to its own outgoing
  request to Google server-side; it is never included in anything sent
  back to the browser.
- Every log statement in both functions (and in `googleOAuthService.ts`)
  has been audited to take only specific, named, whitelisted fields —
  lengths instead of the code/verifier/refresh token themselves, a masked
  client id, and status codes/OAuth error *codes*. None of them ever log
  `req.body`, the outgoing request params, or a successful token response
  wholesale — see the logging-contract comment at the top of `_shared.ts`
  and `googleOAuthService.ts`.
- Access and refresh tokens are stored in `localStorage` under
  `sakhi.googleOAuth.tokens.v1`, scoped to this app's origin like any
  other browser storage — never logged. The browser talks directly to
  `accounts.google.com` (authorization redirect) and
  `www.googleapis.com` (Drive API calls, userinfo); token exchange goes
  to this app's own `/api/oauth/google/exchange`, and refresh to
  `/api/oauth/google/refresh` — those two are the only hops that talk to
  `oauth2.googleapis.com`.
- The PKCE code verifier is single-use and removed from storage
  immediately before the token exchange is attempted (not after success)
  — see the comment on that removal in `handleRedirectCallback` for why.
- Google's original `error`/`error_description` is never discarded: it's
  logged in full, server-side only, by `_shared.ts`'s `forwardToGoogle`.
  The browser instead receives a short, safe, structured message (see the
  Troubleshooting table above) — this is a deliberate choice, not data
  loss; check the function's Vercel logs for the original if you need it.
- Revoking access from the doctor's
  [Google Account permissions page](https://myaccount.google.com/permissions)
  takes effect immediately — the next API call fails with 401, which
  `backupManager.ts` categorizes as an `auth` failure and surfaces in the
  Settings UI and cloud backup history, prompting reconnect.
- **Rate limiting**: neither endpoint currently rate-limits requests. Both
  require an unguessable secret to do anything (a valid PKCE
  `code_verifier` matching a code Google already issued, or a valid
  `refresh_token`), so low-effort credential-guessing isn't a realistic
  concern; Google's own token endpoint also enforces its own limits
  upstream regardless. A real distributed rate limit would need external
  state (Vercel KV, Upstash Redis, etc.) since serverless functions don't
  share in-memory state across invocations/instances — deliberately not
  added now to avoid a new dependency for a low-traffic internal tool.
  Documented here as future work if usage patterns ever change.
