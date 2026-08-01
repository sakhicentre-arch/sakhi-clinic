/**
 * googleOAuthService.ts
 * Sakhi Clinic — Google OAuth implementation (Phase 3).
 *
 * Real Authorization Code + PKCE flow (the recommended flow for a
 * browser-only SPA -- no client secret required, so there is nothing
 * secret to hardcode or leak). This file is genuinely wired to Google's
 * real endpoints; what makes it inert today is purely configuration:
 *
 *   VITE_GOOGLE_OAUTH_CLIENT_ID is not set anywhere in this repository.
 *
 * No client ID is fabricated, guessed, or hardcoded here -- isConfigured()
 * reports that honestly, and every other method refuses to pretend
 * otherwise. Deploying this for real requires only: create a Google Cloud
 * project, enable the Drive API, create an OAuth client ID (Web
 * application type, this app's real origin as an authorized redirect
 * URI), and set VITE_GOOGLE_OAUTH_CLIENT_ID at build time. No code change
 * would be needed.
 *
 * Scope is deliberately minimal: drive.file (files this app creates),
 * never full Drive access.
 */

import type { OAuthAccountInfo, OAuthService, OAuthTokens } from "./oauthService";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
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

/** Logs exactly what's being sent to Google's token endpoint, without ever
 * logging the authorization code, verifier, or any token/secret value --
 * only their lengths, so a bad/empty value is visible without exposing it. */
function logTokenExchangeRequest(input: { redirectUri: string; clientId: string; grantType: string; codeLength: number; verifierLength: number }): void {
  console.info("[googleOAuthService] Token exchange request", {
    redirect_uri: input.redirectUri,
    client_id: maskClientId(input.clientId),
    grant_type: input.grantType,
    code_length: input.codeLength,
    code_verifier_length: input.verifierLength,
  });
}

/** Logs Google's actual rejection reason -- status/statusText/error/
 * error_description are never secrets, unlike the request fields above. */
function logTokenExchangeFailure(input: { status: number; statusText: string; error?: string; errorDescription?: string }): void {
  console.error("[googleOAuthService] Token exchange failed", {
    status: input.status,
    statusText: input.statusText,
    error: input.error,
    error_description: input.errorDescription,
  });
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

    const redirectUri = getRedirectUri();
    const grantType = "authorization_code";
    logTokenExchangeRequest({ redirectUri, clientId, grantType, codeLength: code.length, verifierLength: verifier.length });

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: grantType,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      let googleError: string | undefined;
      let googleErrorDescription: string | undefined;
      try {
        const parsed = JSON.parse(errorBody);
        googleError = parsed.error;
        googleErrorDescription = parsed.error_description;
      } catch {
        // Google almost always returns JSON on a 400 -- fall back to the
        // raw text below if this particular response didn't.
      }
      logTokenExchangeFailure({ status: response.status, statusText: response.statusText, error: googleError, errorDescription: googleErrorDescription });
      const detail = googleErrorDescription || googleError || errorBody || response.statusText;
      throw new Error(`Google token exchange failed (${response.status}): ${detail}`);
    }
    const json = await response.json();

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString(),
      scope: json.scope,
    };
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

    try {
      const body = new URLSearchParams({
        client_id: clientId,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
      });
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!response.ok) {
        writeTokens(null);
        return null;
      }
      const json = await response.json();
      const refreshed: OAuthTokens = {
        accessToken: json.access_token,
        refreshToken: tokens.refreshToken, // Google does not resend it on refresh
        expiresAt: new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString(),
        scope: json.scope || tokens.scope,
      };
      writeTokens(refreshed);
      return refreshed.accessToken;
    } catch {
      return null;
    }
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
