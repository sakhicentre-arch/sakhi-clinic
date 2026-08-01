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

    const verifier = generateCodeVerifier();
    try {
      window.localStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
    } catch {
      return null; // can't complete PKCE without persisting the verifier
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

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error(`Google token exchange failed (${response.status})`);
    }
    const json = await response.json();

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString(),
      scope: json.scope,
    };
    writeTokens(tokens);
    try {
      window.localStorage.removeItem(VERIFIER_STORAGE_KEY);
    } catch {
      // ignore
    }
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
