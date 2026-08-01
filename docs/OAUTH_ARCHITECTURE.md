# Google OAuth Architecture

Technical reference for how Sakhi Clinic's Google Drive OAuth integration
actually works, for whoever maintains or extends it next. For "how do I
configure a fresh Google Cloud project," see `docs/GOOGLE_DRIVE_SETUP.md`.
For "what do I do to deploy/roll back," see
`docs/OAUTH_DEPLOYMENT_CHECKLIST.md`.

## Why a backend hop exists at all

Sakhi Clinic uses OAuth 2.0 **Authorization Code + PKCE** — the flow
Google recommends for a browser-only single-page app. In the generic
OAuth spec, PKCE exists specifically so a "public client" (a browser or
native app that can't keep a secret) can skip `client_secret` entirely.

Google's own implementation does not extend that exemption to the
**Web application** OAuth client type — which is what this app must use,
since it needs an arbitrary hosted HTTPS redirect URI
(`https://<origin>/oauth/google/callback`), a capability only that client
type supports. Google's token endpoint (`oauth2.googleapis.com/token`)
requires `client_secret` on every token request for a Web application
client, regardless of whether PKCE parameters are also present.

Since a secret must never reach the browser, exactly two network calls in
this whole flow cannot happen client-side. Everything else — generating
the PKCE verifier/challenge, redirecting the browser to Google, receiving
the authorization code back — still happens entirely in the browser,
exactly as a pure-PKCE flow would.

## Component map

```
Frontend (all client-side, ships to the browser)
├─ src/services/backup/oauth/oauthService.ts
│    Generic OAuthService interface. Nothing outside oauth/ should import
│    a concrete implementation directly.
├─ src/services/backup/oauth/googleOAuthService.ts
│    The real implementation. Owns PKCE generation, the authorization
│    redirect, localStorage for tokens/verifier, and two PRIVATE helpers
│    (exchangeAuthorizationCode, refreshAccessToken) that are the only
│    code in this file that knows the two backend endpoint paths exist.
│    No other file -- including every UI component -- ever sees those
│    paths or constructs a Google token-endpoint request itself.
├─ src/services/backup/oauth/mockOAuthService.ts
│    In-memory fake implementing the same interface, used only in tests.
├─ src/services/backup/oauth/completeGoogleDriveConnection.ts
│    OAuth redirect landing: turns a completed callback into
│    setActiveProvider(googleDriveProvider). UI-adjacent glue.
├─ src/services/backup/providers/googleDriveProvider.ts
│    Drive API v3 calls (upload/download/list/delete/metadata). Uses the
│    OAuth access token as a Bearer header -- never touches client_secret
│    or the token endpoints at all.
└─ src/App.tsx
     Detects the /oauth/google/callback path, calls
     completeGoogleDriveConnection once.

Backend (Vercel Serverless Functions -- the ONLY non-client-side part)
├─ api/oauth/google/_shared.ts
│    Not a route (Vercel excludes any /api file prefixed "_"). Shared
│    validation, the actual fetch to Google, the error-code -> safe-message
│    map, and the logging discipline both real endpoints follow.
├─ api/oauth/google/exchange.ts
│    POST only. authorization_code grant only. Adds client_secret,
│    forwards to Google, returns tokens or a safe error.
├─ api/oauth/google/refresh.ts
│    POST only. refresh_token grant only. Same shape as exchange.ts, for
│    the other grant type -- deliberately a separate file, not one
│    endpoint branching on grant_type.
└─ api/oauth/google/health.ts
     GET only. Reports whether GOOGLE_OAUTH_CLIENT_SECRET and
     VITE_GOOGLE_OAUTH_CLIENT_ID are present, as booleans. Never calls
     Google, never returns either value.
```

## Flow diagrams

### 1. Connect (authorization code exchange)

```
Doctor clicks "Connect Drive" (SettingsPage.tsx)
        │
        ▼
googleOAuthService.getAuthUrl()
   - reuses an already-pending PKCE verifier if one exists, else
     generates a fresh one and stores it in localStorage
   - computes code_challenge = SHA256(verifier), base64url
   - returns a real accounts.google.com authorization URL
        │
        ▼
window.location.href = url         (full-page redirect, no popup)
        │
        ▼
accounts.google.com                 (Google consent screen)
        │  doctor grants consent
        ▼
redirect to /oauth/google/callback?code=...
        │
        ▼
App.tsx detects the path → completeGoogleDriveConnection()
        │
        ▼
googleOAuthService.handleRedirectCallback(query)
   - reads `code` from the URL (once)
   - reads the stored verifier, then IMMEDIATELY deletes it from
     localStorage (single-use, before the network call -- a duplicate
     invocation of this function fails fast locally instead of replaying
     an already-used code to Google)
   - calls the private exchangeAuthorizationCode() helper
        │
        ▼
POST /api/oauth/google/exchange
   body: { client_id, code, code_verifier, redirect_uri, grant_type }
        │
        ▼
api/oauth/google/exchange.ts
   - validates all four fields are present
   - reads GOOGLE_OAUTH_CLIENT_SECRET from process.env (500 if missing)
   - adds client_secret, forwards to Google
        │
        ▼
POST https://oauth2.googleapis.com/token   (server-to-server)
        │
   ┌────┴────┐
success     failure
   │           │
   │           ▼
   │      Google's full error is logged server-side (console.error);
   │      the browser instead gets { error, message } from a small
   │      fixed map (invalid_grant -> "Authorization expired...", etc.)
   │           │
   ▼           ▼
tokens JSON   safe error JSON, SAME HTTP status Google returned
   │           │
   └─────┬─────┘
         ▼
googleOAuthService writes tokens to localStorage (success) or throws
an Error built from the safe message (failure) -- completeGoogleDrive
Connection() catches it, sets the active provider on success, and
shows the resulting note in Settings either way.
```

### 2. Refresh (silent, triggered by getAccessToken() when the stored token has expired)

```
getAccessToken() finds an expired access token with a stored refresh token
        │
        ▼
refreshAccessToken() -> POST /api/oauth/google/refresh
   body: { client_id, refresh_token, grant_type }
        │
        ▼
api/oauth/google/refresh.ts -- same shape as exchange.ts, adds
client_secret, forwards to Google
        │
   ┌────┴────┐
success     failure
   │           │
   ▼           ▼
new tokens   tokens cleared from localStorage (forces reconnect) if
written      Google explicitly rejected the refresh_token; left
             UNTOUCHED if it was a network failure, so a later retry
             can still use the same refresh_token
```

### 3. Health check (no OAuth flow involved)

```
GET /api/oauth/google/health
        │
        ▼
Reads process.env.VITE_GOOGLE_OAUTH_CLIENT_ID and
process.env.GOOGLE_OAUTH_CLIENT_SECRET -- presence only, as booleans.
No network call to Google. No secret value ever in the response.
        │
        ▼
200 { status: "ok"|"error", oauthConfigured: boolean,
      checks: { clientIdConfigured, clientSecretConfigured } }
```

## Security properties

- **`client_secret` never reaches the browser.** It exists only as
  `process.env.GOOGLE_OAUTH_CLIENT_SECRET` inside the three functions
  under `api/oauth/google/` that read it (`exchange.ts`, `refresh.ts`,
  via `_shared.ts`'s `requireClientSecret`) — never in a `VITE_`-prefixed
  variable, never in a response body, never in a log line.
- **PKCE verifier is single-use.** Deleted from `localStorage` the moment
  it's read for an exchange attempt, before the network call — not after
  success. A verifier already in flight is *reused* (not overwritten) by
  a second `getAuthUrl()` call, so a fast double-click can't create two
  mismatched verifier/challenge pairs.
- **Google's real error is never lost, but never shown raw either.**
  `_shared.ts`'s `forwardToGoogle` logs Google's complete `error` +
  `error_description` server-side (Vercel function logs) on every
  rejection, then returns a short, fixed, doctor-safe message chosen
  from a small map (`invalid_grant`, `invalid_client`,
  `unauthorized_client`, `access_denied`, with a generic fallback for
  anything else).
- **Every log statement in this subsystem is field-whitelisted.** No log
  call anywhere in `api/oauth/google/*.ts` or
  `googleOAuthService.ts` ever logs `req.body`, an outgoing request's
  params, or a successful token response wholesale — only specific named
  fields (status codes, grant type, masked client id, value *lengths*
  instead of the code/verifier/refresh token themselves). See the
  logging-contract comment at the top of `_shared.ts`.
- **No `state` parameter.** This flow relies on PKCE alone for
  request/response binding, not a `state` value. Residual risk is low:
  PKCE's verifier requirement already makes a forged authorization code
  unexchangeable without this specific browser's verifier. Not
  implemented; documented as a known gap.
- **No rate limiting on the endpoints.** Both require an unguessable
  secret (a matching PKCE verifier or a valid refresh token) to do
  anything, and Vercel Serverless Functions are stateless across
  invocations, so an in-memory limiter would be theater, not protection.
  A real one would need external state (Vercel KV, Upstash Redis) —
  deliberately not added for a low-traffic internal tool. See
  `docs/OAUTH_DEPLOYMENT_CHECKLIST.md` for what to reach for if this
  changes.

## Design decisions (and why)

| Decision | Reasoning |
|---|---|
| Two endpoints (`exchange.ts`, `refresh.ts`), not one branching on `grant_type` | Each file only contains the validation/logic its own grant type needs — easier to read, easier to test in isolation. |
| Shared logic lives in `_shared.ts`, prefixed `_` | DRY between the two endpoints without Vercel deploying it as a third route. |
| `GOOGLE_OAUTH_CLIENT_SECRET`, not `GOOGLE_DRIVE_CLIENT_SECRET` | Google's model is one OAuth client across many scopes (Drive, Calendar, Gmail, Contacts, ...). A Drive-specific name would become misleading — and need renaming again — the moment a second feature reuses the same client. |
| `api/oauth/google/`, not flattened to `api/google/` | Keeps "OAuth plumbing" namespaced separately from any future feature-specific Google endpoints (e.g. a hypothetical Calendar events endpoint), which would otherwise sit in the same folder. |
| `revoke.ts` / other endpoints not added | Nothing in the app calls Google's revoke endpoint today (Disconnect only clears local tokens) — added only if a real feature needs it, not speculatively. |
| No rate limiting yet | See "Security properties" above. |

## Extending this later

Adding a Google Calendar/Gmail/Contacts integration should, in almost
every case, mean: add the new scope to the *same* Google Cloud OAuth
client (Step 3/4 in `docs/GOOGLE_DRIVE_SETUP.md`), keep reusing
`VITE_GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` as-is, and
add feature-specific endpoints under `api/google/<feature>/` (sibling to,
not inside, `api/oauth/google/`) — the OAuth handshake itself doesn't
change per feature, only the scope requested and the API calls made with
the resulting access token.
