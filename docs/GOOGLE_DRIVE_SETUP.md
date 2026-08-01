# Google Drive Backup — Production Setup

This is the complete, one-time configuration needed to turn on Google Drive
as a backup destination. No code changes are required to complete this —
the integration (`src/services/backup/oauth/googleOAuthService.ts`,
`src/services/backup/providers/googleDriveProvider.ts`) is already built
and wired into the app; it is just inert until a real OAuth client exists.

Until this is done, the app is fully functional with **local (on-device)
backups only** — see `DOCTOR_OPERATIONAL_GUIDE.md`. Nothing below is
required to use Sakhi Clinic.

## What you're setting up

Sakhi Clinic uses OAuth 2.0 **Authorization Code + PKCE** — the flow Google
recommends for a browser-only single-page app. There is no client secret:
PKCE removes the need for one, so nothing here is a value you must keep
confidential the way you would a server-side API key.

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
5. Save. Copy the generated **Client ID** (looks like
   `123456789-abc...apps.googleusercontent.com`). You do not need the
   client secret Google also shows here — this app never uses it.

## Step 5 — Set the environment variable

Copy `.env.example` to `.env` (or `.env.local`, or your hosting
provider's environment variable UI) and set:

```
VITE_GOOGLE_OAUTH_CLIENT_ID=123456789-abc...apps.googleusercontent.com
```

Rebuild/redeploy (`npm run build`). Vite inlines `VITE_`-prefixed
variables at build time — changing this value requires a rebuild, not
just a server restart.

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
| Consent succeeds but Settings shows "Could not connect Google Drive: Google token exchange failed (400)" | PKCE verifier mismatch — usually caused by starting the flow in one browser/profile and completing it in another, or browser storage (localStorage) was cleared mid-flow | Restart the Connect flow from the same browser session; don't email/forward the consent URL to another device. |
| Upload fails with a 401/403 shortly after connecting | Access token expired and no refresh token was issued (can happen if `access_type=offline` consent wasn't re-prompted) | Disconnect and reconnect Drive — `getAuthUrl()` already requests `access_type=offline&prompt=consent` so a fresh connect always issues a refresh token. |
| Everything above looks right and it still fails | Check Settings > Cloud Backup > Cloud backup history for the failed job's stage/message, and the browser console/network tab for the actual Drive API response | The failure reason is categorized (`auth`, `quota`, `network`, etc. — see `categorizeError` in `backupManager.ts`) and shown per-job; it is not swallowed. |

## Security notes

- No credential is ever committed to this repository. `.env` is
  git-ignored (see `.gitignore`).
- Access and refresh tokens are stored in `localStorage` under
  `sakhi.googleOAuth.tokens.v1`, scoped to this app's origin like any
  other browser storage — never logged, never sent anywhere except
  directly to `accounts.google.com` / `oauth2.googleapis.com` /
  `www.googleapis.com`.
- The PKCE code verifier is single-use and removed from storage
  immediately after a successful exchange (or left in place only if the
  exchange never completes, in which case it simply expires unused).
- Revoking access from the doctor's
  [Google Account permissions page](https://myaccount.google.com/permissions)
  takes effect immediately — the next API call fails with 401, which
  `backupManager.ts` categorizes as an `auth` failure and surfaces in the
  Settings UI and cloud backup history, prompting reconnect.
