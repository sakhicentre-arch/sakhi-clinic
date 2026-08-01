import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Startup diagnostic: the operational event log should reflect whether
 * Google Drive OAuth is configured for this deployment from boot, without
 * requiring anyone to open Settings first. Covers both the configured and
 * unconfigured cases via a mocked googleOAuthService -- no real network or
 * credentials involved.
 */

const DB_NAME = "SakhiClinicDB";

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe("logDriveConfigurationDiagnostic", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
  });

  afterEach(async () => {
    vi.doUnmock("../../services/backup/oauth/googleOAuthService");
    db.close();
    await resetDatabase();
  });

  it("logs an informational event with configured:false when no OAuth client ID is set", async () => {
    vi.doMock("../../services/backup/oauth/googleOAuthService", () => ({
      googleOAuthService: { isConfigured: () => false },
    }));

    const { logDriveConfigurationDiagnostic } = await import("../../services/backup/oauth/driveConfigDiagnostics");
    const { getRecentOperationalEvents } = await import("../../services/operationalEventLogService");

    await logDriveConfigurationDiagnostic();

    const events = await getRecentOperationalEvents(5);
    const event = events.find((e) => e.type === "backup.drive.configuration_status");
    expect(event).toBeDefined();
    expect(event?.level).toBe("info");
    expect(event?.data).toEqual({ configured: false });
    expect(event?.message).toMatch(/not configured/i);
  });

  it("logs configured:true when an OAuth client ID is set", async () => {
    vi.doMock("../../services/backup/oauth/googleOAuthService", () => ({
      googleOAuthService: { isConfigured: () => true },
    }));

    const { logDriveConfigurationDiagnostic } = await import("../../services/backup/oauth/driveConfigDiagnostics");
    const { getRecentOperationalEvents } = await import("../../services/operationalEventLogService");

    await logDriveConfigurationDiagnostic();

    const events = await getRecentOperationalEvents(5);
    const event = events.find((e) => e.type === "backup.drive.configuration_status");
    expect(event).toBeDefined();
    expect(event?.data).toEqual({ configured: true });
    expect(event?.message).toMatch(/is configured/i);
  });

  it("never throws even if logging itself fails", async () => {
    vi.doMock("../../services/backup/oauth/googleOAuthService", () => ({
      googleOAuthService: { isConfigured: () => true },
    }));
    vi.doMock("../../services/operationalEventLogService", () => ({
      logOperationalEvent: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
    }));

    const { logDriveConfigurationDiagnostic } = await import("../../services/backup/oauth/driveConfigDiagnostics");
    await expect(logDriveConfigurationDiagnostic()).resolves.toBeUndefined();

    vi.doUnmock("../../services/operationalEventLogService");
  });
});
