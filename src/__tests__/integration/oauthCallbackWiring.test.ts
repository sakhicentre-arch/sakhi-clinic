import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * completeGoogleDriveConnection.ts is authentication-only: a successful
 * OAuth callback must NEVER change the active backup destination (see
 * backupSettingsService.ts's own doc comment -- connecting Google Drive
 * only ever means "Google Drive is available," never "Google Drive is
 * now where backups go"). This file proves that boundary holds in both
 * directions: neither a successful nor a failed callback touches
 * getActiveProvider()/the persisted destination preference, and the
 * destination only ever changes via an explicit setBackupDestination()
 * call, independent of auth state -- using a mocked googleOAuthService so
 * no real network or credentials are involved.
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

/** The global test setup (src/__tests__/setup.ts) stubs localStorage as
 * bare vi.fn() spies with no real implementation -- fine for tests that
 * only assert "was it called," but this file needs an actual working
 * round-trip (setBackupDestination persists, getActiveProvider reads it
 * back), so it installs its own working in-memory Storage here instead. */
function installWorkingLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
}

describe("completeGoogleDriveConnection (OAuth is authentication-only, never destination)", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    installWorkingLocalStorage();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    db.close();
    await resetDatabase();
  });

  it("exposes the exact redirect path App.tsx must detect", async () => {
    const { GOOGLE_OAUTH_CALLBACK_PATH } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    expect(GOOGLE_OAUTH_CALLBACK_PATH).toBe("/oauth/google/callback");
  });

  it("on a successful callback, the active backup destination stays on local (unchanged)", async () => {
    const { completeGoogleDriveConnection } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    const { getActiveProvider } = await import("../../services/backup/backupManager");

    expect(getActiveProvider().id).toBe("local");

    const result = await completeGoogleDriveConnection("?code=abc123");

    expect(result.ok).toBe(true);
    expect(getActiveProvider().id).toBe("local");
  });

  it("on a failed callback, returns the error and the active provider is still untouched", async () => {
    const { completeGoogleDriveConnection } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    const { getActiveProvider } = await import("../../services/backup/backupManager");

    const result = await completeGoogleDriveConnection("?code=fail");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/token exchange failed/i);
    expect(getActiveProvider().id).toBe("local");
  });

  it("only an explicit setBackupDestination() call changes the active provider, regardless of auth state", async () => {
    const { completeGoogleDriveConnection } = await import("../../services/backup/oauth/completeGoogleDriveConnection");
    const { getActiveProvider } = await import("../../services/backup/backupManager");
    const { setBackupDestination } = await import("../../services/backup/backupSettingsService");

    await completeGoogleDriveConnection("?code=abc123"); // authenticates successfully
    expect(getActiveProvider().id).toBe("local"); // still local -- auth alone never changes it

    setBackupDestination("google-drive"); // the doctor's own explicit choice
    expect(getActiveProvider().id).toBe("google-drive");
  });
});
