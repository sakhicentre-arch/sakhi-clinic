import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Doctor Workflow Completion, item 4: DashboardPage.tsx needed to show the
 * same Backup Health status, Storage Used, and formatted byte sizes as
 * SettingsPage.tsx without a second copy of that logic. This proves the
 * three functions extracted for that reuse (formatBytes, getStorageEstimate,
 * getBackupHealthSummary) behave correctly on their own, independent of
 * either page's rendering.
 */

describe("storageHealthService — formatBytes", () => {
  it("formats null/undefined as an em dash", async () => {
    const { formatBytes } = await import("../../services/storageHealthService");
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });

  it("formats sub-MB sizes in KB", async () => {
    const { formatBytes } = await import("../../services/storageHealthService");
    expect(formatBytes(512000)).toBe("500 KB");
  });

  it("formats MB-and-above sizes in MB", async () => {
    const { formatBytes } = await import("../../services/storageHealthService");
    expect(formatBytes(5242880)).toBe("5.00 MB");
  });
});

describe("storageHealthService — getStorageEstimate", () => {
  const originalStorage = (navigator as any).storage;

  afterEach(() => {
    Object.defineProperty(navigator, "storage", { value: originalStorage, configurable: true });
  });

  it("returns null usage/quota when navigator.storage.estimate is unavailable", async () => {
    Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
    const { getStorageEstimate } = await import("../../services/storageHealthService");
    const result = await getStorageEstimate();
    expect(result).toEqual({ usageBytes: null, quotaBytes: null });
  });

  it("returns usage/quota from a real estimate() response", async () => {
    Object.defineProperty(navigator, "storage", {
      value: { estimate: vi.fn(async () => ({ usage: 1000, quota: 5000 })) },
      configurable: true,
    });
    const { getStorageEstimate } = await import("../../services/storageHealthService");
    const result = await getStorageEstimate();
    expect(result).toEqual({ usageBytes: 1000, quotaBytes: 5000 });
  });

  it("degrades to nulls if estimate() throws", async () => {
    Object.defineProperty(navigator, "storage", {
      value: { estimate: vi.fn(async () => { throw new Error("denied"); }) },
      configurable: true,
    });
    const { getStorageEstimate } = await import("../../services/storageHealthService");
    const result = await getStorageEstimate();
    expect(result).toEqual({ usageBytes: null, quotaBytes: null });
  });
});

describe("storageHealthService — getBackupHealthSummary", () => {
  beforeEach(() => {
    vi.resetModules();
    // The global localStorage mock in src/__tests__/setup.ts is a bare
    // vi.fn() stub (no real get/set round-trip) -- this suite needs
    // recordBackupSuccess()/getLastBackupAt() to actually persist within a
    // test, so give it a real in-memory backing store, scoped to this file.
    const store = new Map<string, string>();
    (global as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
  });

  it("reports 'critical' when there are failed backup jobs, regardless of staleness", async () => {
    vi.doMock("../../services/backup/backupManager", () => ({
      getActiveProvider: () => ({ id: "local", label: "This Device" }),
    }));
    vi.doMock("../../services/backup/backupSettingsService", () => ({
      LOCAL_DESTINATION_ID: "local",
    }));
    vi.doMock("../../services/backup/backupJobService", () => ({
      listRecentJobs: async () => [{ status: "failed" }, { status: "success" }],
    }));
    vi.doMock("../../services/backup/oauth/googleOAuthService", () => ({
      googleOAuthService: { isAuthenticated: async () => false },
    }));

    const { getBackupHealthSummary, recordBackupSuccess } = await import("../../services/storageHealthService");
    recordBackupSuccess(new Date().toISOString()); // recent backup -- would otherwise read as healthy
    const result = await getBackupHealthSummary();
    expect(result.level).toBe("critical");
    expect(result.message).toContain("failed");
  });

  it("reports 'attention' when the backup is stale and there are no failed jobs", async () => {
    vi.doMock("../../services/backup/backupManager", () => ({
      getActiveProvider: () => ({ id: "local", label: "This Device" }),
    }));
    vi.doMock("../../services/backup/backupSettingsService", () => ({
      LOCAL_DESTINATION_ID: "local",
    }));
    vi.doMock("../../services/backup/backupJobService", () => ({
      listRecentJobs: async () => [],
    }));
    vi.doMock("../../services/backup/oauth/googleOAuthService", () => ({
      googleOAuthService: { isAuthenticated: async () => false },
    }));

    const { getBackupHealthSummary } = await import("../../services/storageHealthService");
    // No recordBackupSuccess call -- no backup has ever been taken, which
    // isBackupStale() treats as stale.
    const result = await getBackupHealthSummary();
    expect(result.level).toBe("attention");
  });

  it("reports 'healthy' when a recent backup exists, no failed jobs, and the destination is reachable", async () => {
    vi.doMock("../../services/backup/backupManager", () => ({
      getActiveProvider: () => ({ id: "local", label: "This Device" }),
    }));
    vi.doMock("../../services/backup/backupSettingsService", () => ({
      LOCAL_DESTINATION_ID: "local",
    }));
    vi.doMock("../../services/backup/backupJobService", () => ({
      listRecentJobs: async () => [{ status: "success" }],
    }));
    vi.doMock("../../services/backup/oauth/googleOAuthService", () => ({
      googleOAuthService: { isAuthenticated: async () => false },
    }));

    const { getBackupHealthSummary, recordBackupSuccess } = await import("../../services/storageHealthService");
    recordBackupSuccess(new Date().toISOString());
    const result = await getBackupHealthSummary();
    expect(result).toEqual({ level: "healthy", message: "Backups are up to date." });
  });
});
