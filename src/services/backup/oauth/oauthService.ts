/**
 * oauthService.ts
 * Sakhi Clinic — Backup Engine: OAuth abstraction (Phase 3).
 *
 * Generic interface so GoogleDriveProvider (and any future OneDrive/
 * Dropbox provider that also needs OAuth) depends on THIS shape, never on
 * a concrete OAuth implementation. Nothing outside src/services/backup/
 * oauth/ should import googleOAuthService.ts or mockOAuthService.ts
 * directly -- callers take an OAuthService.
 *
 * isConfigured() is the honesty gate: it reports whether a real client ID
 * has been supplied by whoever deploys this app, NOT whether the doctor
 * has signed in. A provider must check this before ever claiming
 * "Connect" is a real action -- see googleOAuthService.ts's own comment
 * for why no credentials are fabricated here.
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp; the access token is not to be trusted past this. */
  expiresAt: string;
  scope?: string;
}

export interface OAuthAccountInfo {
  email?: string;
  displayName?: string;
}

export interface OAuthService {
  readonly id: string;

  /** Has a real client ID (or equivalent) been supplied? Independent of sign-in state. */
  isConfigured(): boolean;

  /** Is there a currently valid (or refreshable) session? */
  isAuthenticated(): Promise<boolean>;

  /** URL to send the doctor to for consent. Null if !isConfigured(). */
  getAuthUrl(): Promise<string | null>;

  /** Completes the flow after the provider redirects back with a code. */
  handleRedirectCallback(query: URLSearchParams): Promise<OAuthTokens>;

  /** A valid access token, refreshing first if needed. Null if not authenticated. */
  getAccessToken(): Promise<string | null>;

  getAccountInfo(): Promise<OAuthAccountInfo | null>;

  signOut(): Promise<void>;
}
