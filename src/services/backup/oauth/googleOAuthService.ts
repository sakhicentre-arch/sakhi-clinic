/**
 * googleOAuthService.ts
 * Sakhi Clinic — Google OAuth implementation (Phase 3).
 *
 * Real Authorization Code + PKCE flow. PKCE removes the need for a client
 * secret per the generic OAuth spec, but Google's "Web application" client
 * type does not waive it: Google's token endpoint requires client_secret on
 * every token request regardless of PKCE (see docs/GOOGLE_DRIVE_SETUP.md).
 * Since a secret must never be shipped to the browser, the authorization
 * redirect and callback handling below still happen entirely client-side,
 * but the two calls that exchange/refresh a token go through this app's own
 * serverless endpoints instead of Google directly:
 *
 *   exchangeAuthorizationCode() -> POST /api/oauth/google/exchange
 *   refreshAccessToken()        -> POST /api/oauth/google/refresh
 *
 * Those two endpoints (api/oauth/google/exchange.ts, refresh.ts) are the
 * only place client_secret is ever read, from a server-only
 * GOOGLE_OAUTH_CLIENT_SECRET env var. This file -- and everything calling
 * it, including the UI -- never sees that secret and never constructs a
 * Google token-endpoint URL itself; it only knows about its own two
 * endpoint paths, which are private implementation details of this module.
 *
 * What makes this inert today is purely configuration:
 *
 *   VITE_GOOGLE_OAUTH_CLIENT_ID is not set anywhere in this repository.
 *
 * No client ID is fabricated, guessed, or hardcoded here -- isConfigured()
 * reports that honestly, and every other method refuses to pretend
 * otherwise. Deploying this for real requires: create a Google Cloud
 * project, enable the Drive API, create an OAuth client ID (Web
 * application type, this app's real origin as an authorized redirect
 * URI), set VITE_GOOGLE_OAUTH_CLIENT_ID at build time, and set
 * GOOGLE_OAUTH_CLIENT_SECRET as a server-side environment variable
 * wherever api/oauth/google/*.ts runs (e.g. the Vercel project's
 * environment variables, never a VITE_-prefixed one). No further code
 * change would be needed.
 *
 * Scope is deliberately minimal: drive.file (files this app creates),
 * never full Drive access.
 */

import type { OAuthAccountInfo, OAuthService, OAuthTokens } from "./oauthService";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
// Google's "Web application" OAuth client type requires client_secret on
// every token request, even with PKCE (see docs/GOOGLE_DRIVE_SETUP.md) --
// client_secret must never reach the browser, so these two calls go through
// our own serverless endpoints (api/oauth/google/exchange.ts and
// refresh.ts -- one per grant type, deliberately not a single endpoint that
// branches), which are the only places that hold the secret. Everything
// else about this flow (PKCE generation, the authorization redirect,
// callback handling) is unchanged and still happens entirely in the
// browser. No caller of this module ever sees these paths -- see
// exchangeAuthorizationCode()/refreshAccessToken() below.
const EXCHANGE_ENDPOINT = "/api/oauth/google/exchange";
const REFRESH_ENDPOINT = "/api/oauth/google/refresh";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const STORAGE_KEY = "sakhi.googleOAuth.tokens.v1";
const VERIFIER_STORAGE_KEY = "sakhi.googleOAuth.pkceVerifier.v1";

function getClientId(): string | null {
  try {
    const id = (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID;
    return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

function getRedirectUri(): string {
  try {
    return `${window.location.origin}/oauth/google/callback`;
  } catch {
    return "";
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function readTokens(): OAuthTokens | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OAuthTokens) : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: OAuthTokens | null): void {
  try {
    if (tokens) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore -- worst case, the doctor is asked to reconnect
  }
}

function isExpired(tokens: OAuthTokens): boolean {
  const t = Date.parse(tokens.expiresAt);
  return !Number.isFinite(t) || Date.now() >= t;
}

/** Client IDs aren't secret (they're already visible in the auth redirect's
 * own URL), but diagnostic logs mask them anyway rather than assume that. */
function maskClientId(clientId: string): string {
  return clientId.length <= 10 ? "***" : `${clientId.slice(0, 6)}...${clientId.slice(-4)}`;
}

/**
 * Logging contract for this whole file (audited): every log call below
 * takes ONLY specific, named, whitelisted fields -- lengths instead of the
 * authorization code/verifier/refresh token themselves, a masked client
 * id, and the SAFE message/error code this module already received from
 * our own endpoint (never Google's raw error_description, and never a
 * request/response body logged wholesale). If you add a log call to this
 * file, it must follow the same rule.
 */
function logExchangeRequest(input: { redirectUri: string; clientId: string; codeLength: number; verifierLength: number }): void {
  console.info("[googleOAuthService] Token exchange request", {
    redirect_uri: input.redirectUri,
    client_id: maskClientId(input.clientId),
    grant_type: "authorization_code",
    code_length: input.codeLength,
    code_verifier_length: input.verifierLength,
  });
}

function logExchangeFailure(input: { status: number; error?: string; message?: string }): void {
  console.error("[googleOAuthService] Token exchange failed", {
    status: input.status,
    error: input.error,
    message: input.message,
  });
}

function logRefreshRequest(input: { clientId: string; refreshTokenLength: number }): void {
  console.info("[googleOAuthService] Token refresh request", {
    client_id: maskClientId(input.clientId),
    grant_type: "refresh_token",
    refresh_token_length: input.refreshTokenLength,
  });
}

function logRefreshFailure(input: { status: number; error?: string; message?: string }): void {
  console.error("[googleOAuthService] Token refresh failed", {
    status: input.status,
    error: input.error,
    message: input.message,
  });
}

/** Parses our own endpoint's failure body -- { error, message } (see
 * api/oauth/google/_shared.ts) -- never Google's raw error_description.
 * Falls back gracefully if the body isn't JSON for some reason (a
 * mis-deployed function, a proxy in front of it, etc.). */
async function parseFailureBody(response: Response): Promise<{ raw: string; error?: string; message?: string }> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return {
      raw,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
    };
  } catch {
    return { raw };
  }
}

/**
 * Internal only -- exchanges an authorization code for tokens via our own
 * /api/oauth/google/exchange endpoint. No caller of googleOAuthService
 * (UI included) ever calls this directly or knows this endpoint exists;
 * only handleRedirectCallback below does.
 */
async function exchangeAuthorizationCode(input: { clientId: string; code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokens> {
  logExchangeRequest({
    redirectUri: input.redirectUri,
    clientId: input.clientId,
    codeLength: input.code.length,
    verifierLength: input.codeVerifier.length,
  });

  const body = new URLSearchParams({
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(EXCHANGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const { raw, error, message } = await parseFailureBody(response);
    logExchangeFailure({ status: response.status, error, message });
    const detail = message || error || raw || response.statusText;
    throw new Error(`Google token exchange failed (${response.status}): ${detail}`);
  }

  const json = await response.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString(),
    scope: json.scope,
  };
}

/**
 * Internal only -- refreshes an access token via our own
 * /api/oauth/google/refresh endpoint. Preserves the exact behavior
 * getAccessToken() already had: a successful refresh writes the new
 * tokens, an explicit rejection from the endpoint clears stored tokens
 * (forcing a reconnect), and a network failure does neither, leaving
 * whatever was stored untouched so a later retry can still use it.
 */
async function refreshAccessToken(input: { clientId: string; refreshToken: string; previousScope?: string }): Promise<OAuthTokens | null> {
  logRefreshRequest({ clientId: input.clientId, refreshTokenLength: input.refreshToken.length });

  try {
    const body = new URLSearchParams({
      client_id: input.clientId,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetch(REFRESH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      const { error, message } = await parseFailureBody(response);
      logRefreshFailure({ status: response.status, error, message });
      writeTokens(null);
      return null;
    }
    const json = await response.json();
    const refreshed: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: input.refreshToken, // Google does not resend it on refresh
      expiresAt: new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString(),
      scope: json.scope || input.previousScope,
    };
    writeTokens(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

export const googleOAuthService: OAuthService = {
  id: "google",

  isConfigured(): boolean {
    return getClientId() !== null;
  },

  async isAuthenticated(): Promise<boolean> {
    const tokens = readTokens();
    if (!tokens) return false;
    if (!isExpired(tokens)) return true;
    return Boolean(tokens.refreshToken) && Boolean(await this.getAccessToken());
  },

  async getAuthUrl(): Promise<string | null> {
    const clientId = getClientId();
    if (!clientId) return null;

    // Reuse an already-pending verifier instead of overwriting it. Two
    // overlapping calls here (a fast double-click on Connect Drive, or any
    // other duplicate invocation before the first redirect completes) must
    // not each mint their own verifier into the same localStorage key --
    // whichever one wrote last would silently invalidate the code_challenge
    // tied to the authorization code Google ends up issuing, and the token
    // exchange would fail with an opaque invalid_grant. Only start a fresh
    // PKCE pair when nothing is already in flight.
    let verifier: string | null;
    try {
      verifier = window.localStorage.getItem(VERIFIER_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!verifier) {
      verifier = generateCodeVerifier();
      try {
        window.localStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
      } catch {
        return null; // can't complete PKCE without persisting the verifier
      }
    }
    const challenge = await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      response_type: "code",
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  },

  async handleRedirectCallback(query: URLSearchParams): Promise<OAuthTokens> {
    const clientId = getClientId();
    if (!clientId) throw new Error("Google Drive is not configured (missing OAuth client ID)");

    const code = query.get("code");
    if (!code) throw new Error(query.get("error") || "Google did not return an authorization code");

    const verifier = (() => {
      try {
        return window.localStorage.getItem(VERIFIER_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (!verifier) throw new Error("Missing PKCE verifier -- the sign-in flow was not started from this device/session");

    // Consume the verifier now, before the network call -- a verifier is
    // valid for exactly one exchange attempt. If this callback somehow runs
    // a second time for the same redirect (a duplicate effect invocation, a
    // manual refresh of the callback URL mid-flight, browser back/forward
    // cache restoring the page), the second run finds no verifier and fails
    // fast with the clear error above, instead of resending an
    // already-consumed authorization code to Google -- which Google would
    // otherwise reject with an opaque invalid_grant 400 that looks like a
    // configuration problem but is actually just a replay.
    try {
      window.localStorage.removeItem(VERIFIER_STORAGE_KEY);
    } catch {
      // ignore
    }

    const tokens = await exchangeAuthorizationCode({ clientId, code, codeVerifier: verifier, redirectUri: getRedirectUri() });
    writeTokens(tokens);
    return tokens;
  },

  async getAccessToken(): Promise<string | null> {
    const clientId = getClientId();
    if (!clientId) return null;

    const tokens = readTokens();
    if (!tokens) return null;
    if (!isExpired(tokens)) return tokens.accessToken;
    if (!tokens.refreshToken) {
      writeTokens(null);
      return null;
    }

    const refreshed = await refreshAccessToken({ clientId, refreshToken: tokens.refreshToken, previousScope: tokens.scope });
    return refreshed ? refreshed.accessToken : null;
  },

  async getAccountInfo(): Promise<OAuthAccountInfo | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const response = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      const json = await response.json();
      return { email: json.email, displayName: json.name };
    } catch {
      return null;
    }
  },

  async signOut(): Promise<void> {
    writeTokens(null);
    try {
      window.localStorage.removeItem(VERIFIER_STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
