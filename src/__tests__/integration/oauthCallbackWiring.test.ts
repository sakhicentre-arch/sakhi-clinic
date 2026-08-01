import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Phase 3 self-review catch: googleOAuthService.ts implements a real PKCE
 * redirect flow, but nothing originally turned a completed redirect into
 * an active Google Drive provider. completeGoogleDriveConnection.ts (and
 * App.tsx's detection of GOOGLE_OAUTH_CALLBACK_PATH) closes that gap. This
 * file proves the wiring itself -- that a successful callback really does
 * call setActiveProvider(googleDriveProvider), and a failed one leaves the
 * active provider on local -- using a mocked googleOAuthService so no real
 * network or credentials are involved.
 */

vi.mock("../../services/backup/oauth/googleOAuthService", () => ({
  googleOAuthService: {
    id: "google",
    isConfigured: () => true,
    isAuthenticated: vi.fn(async () => true),
    getAuthUrl: vi.fn(async () => "https://accounts.google.com/o/oauth2/v2/auth?mock=1"),
    handleRedirectCallback: vi.fn(async (query: URLSearchParams) => {
      if (query.get("code") === "fail") throw new Error("Google token exchange failed (400)");
      return { accessToken: "mock-token", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
    }),
    getAccessToken: vi.fn(async () => "mock-token"),
    getAccountInfo: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
  },
}));

const DB_NAME = "SakhiClinicDB";

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe("completeGoogleDriveConnection (OAuth redirect -> active provider wiring)", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
  });

  afterEach(async () => {
    const { resetActiveProviderToLocal } = await import("../../services/backup/backupManager");
    resetActiveProviderToLocal();
    db.close();
    await resetDatabase();
  });

  it("exposes the exact redirect path App.tsx must detect", async () => {
    const { GOOGLE_OAUTH_CALLBACK_PATH } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    expect(GOOGLE_OAUTH_CALLBACK_PATH).toBe("/oauth/google/callback");
  });

  it("on a successful callback, sets Google Drive as the active backup provider", async () => {
    const { completeGoogleDriveConnection } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    const { getActiveProvider } = await import("../../services/backup/backupManager");

    expect(getActiveProvider().id).toBe("local");

    const result = await completeGoogleDriveConnection("?code=abc123");

    expect(result.ok).toBe(true);
    expect(getActiveProvider().id).toBe("google-drive");
  });

  it("on a failed callback, returns the error and leaves the active provider on local", async () => {
    const { completeGoogleDriveConnection } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    const { getActiveProvider } = await import("../../services/backup/backupManager");

    const result = await completeGoogleDriveConnection("?code=fail");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/token exchange failed/i);
    expect(getActiveProvider().id).toBe("local");
  });
});
