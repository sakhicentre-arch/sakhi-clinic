/**
 * mockOAuthService.ts
 * Sakhi Clinic — In-memory OAuth fake for development/testing (Phase 3).
 *
 * Implements the exact same OAuthService interface googleOAuthService.ts
 * does, so tests (and, if ever wired up, a local dev toggle) can exercise
 * the full connect/disconnect/token-refresh flow through GoogleDriveProvider
 * without any network calls or real Google project. This is explicitly
 * NOT used in production code paths -- only googleOAuthService.ts is wired
 * into the real googleDriveProvider.ts.
 */

import type { OAuthAccountInfo, OAuthService, OAuthTokens } from "./oauthService";

export function createMockOAuthService(input?: { configured?: boolean }): OAuthService & {
  simulateSignIn: (tokens?: Partial<OAuthTokens>) => void;
  simulateExpiry: () => void;
} {
  let configured = input?.configured ?? true;
  let tokens: OAuthTokens | null = null;

  return {
    id: "mock",

    isConfigured() {
      return configured;
    },

    async isAuthenticated() {
      if (!tokens) return false;
      return Date.now() < Date.parse(tokens.expiresAt);
    },

    async getAuthUrl() {
      return configured ? "https://mock.example/authorize" : null;
    },

    async handleRedirectCallback(query: URLSearchParams) {
      if (!configured) throw new Error("Mock OAuth is not configured");
      const code = query.get("code");
      if (!code) throw new Error("Missing code");
      tokens = {
        accessToken: `mock-access-${code}`,
        refreshToken: `mock-refresh-${code}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
      return tokens;
    },

    async getAccessToken() {
      if (!tokens) return null;
      if (Date.now() >= Date.parse(tokens.expiresAt)) {
        if (!tokens.refreshToken) {
          tokens = null;
          return null;
        }
        tokens = { ...tokens, accessToken: `${tokens.accessToken}-refreshed`, expiresAt: new Date(Date.now() + 3600_000).toISOString() };
      }
      return tokens.accessToken;
    },

    async getAccountInfo(): Promise<OAuthAccountInfo | null> {
      if (!tokens) return null;
      return { email: "doctor@example.com", displayName: "Mock Doctor" };
    },

    async signOut() {
      tokens = null;
    },

    // Test-only helpers, not part of OAuthService.
    simulateSignIn(overrides?: Partial<OAuthTokens>) {
      tokens = {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        ...overrides,
      };
    },
    simulateExpiry() {
      if (tokens) tokens = { ...tokens, expiresAt: new Date(Date.now() - 1000).toISOString() };
    },
  };
}
