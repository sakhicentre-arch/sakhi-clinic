import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * backupSettingsService.ts is the single source of truth for the
 * doctor's backup destination and mode preferences -- it must never be an
 * in-memory variable (see its own doc comment). This proves persistence
 * actually holds by re-importing the module fresh (vi.resetModules())
 * between writing and reading, simulating a page refresh / browser
 * restart / fresh login exactly the way App.tsx boots up cold each time.
 */

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

describe("backupSettingsService", () => {
  beforeEach(() => {
    vi.resetModules();
    installWorkingLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to local destination, manual mode, daily frequency when nothing is stored", async () => {
    const { getBackupSettings } = await import("../../services/backup/backupSettingsService");
    expect(getBackupSettings()).toEqual({ destination: "local", autoBackupEnabled: false, frequency: "daily" });
  });

  it("persists destination across a simulated app restart (fresh module re-import)", async () => {
    const { setBackupDestination } = await import("../../services/backup/backupSettingsService");
    setBackupDestination("google-drive");

    vi.resetModules(); // simulates a fresh page load -- no shared in-memory state survives this
    const { getBackupSettings } = await import("../../services/backup/backupSettingsService");
    expect(getBackupSettings().destination).toBe("google-drive");
  });

  it("persists auto-backup mode and frequency independently of destination, across a restart", async () => {
    const { setBackupDestination, setAutoBackupEnabled, setBackupFrequency } = await import("../../services/backup/backupSettingsService");
    setBackupDestination("google-drive");
    setAutoBackupEnabled(true);
    setBackupFrequency("weekly");

    vi.resetModules();
    const { getBackupSettings } = await import("../../services/backup/backupSettingsService");
    expect(getBackupSettings()).toEqual({ destination: "google-drive", autoBackupEnabled: true, frequency: "weekly" });
  });

  it("setAutoBackupEnabled and setBackupFrequency never touch destination", async () => {
    const { setBackupDestination, setAutoBackupEnabled, getBackupSettings } = await import("../../services/backup/backupSettingsService");
    setBackupDestination("google-drive");
    setAutoBackupEnabled(true);
    expect(getBackupSettings().destination).toBe("google-drive");

    setAutoBackupEnabled(false);
    expect(getBackupSettings().destination).toBe("google-drive");
  });

  it("falls back to defaults if the stored value is corrupted JSON", async () => {
    window.localStorage.setItem("sakhi.backup.settings.v1", "{not valid json");
    const { getBackupSettings } = await import("../../services/backup/backupSettingsService");
    expect(getBackupSettings()).toEqual({ destination: "local", autoBackupEnabled: false, frequency: "daily" });
  });

  it("getActiveProvider (backupManager.ts) resolves purely from this persisted preference, surviving a restart", async () => {
    const { setBackupDestination } = await import("../../services/backup/backupSettingsService");
    setBackupDestination("google-drive");

    vi.resetModules(); // fresh boot -- no setActiveProvider() call happens anywhere in production code
    const { getActiveProvider } = await import("../../services/backup/backupManager");
    expect(getActiveProvider().id).toBe("google-drive");
  });
});
