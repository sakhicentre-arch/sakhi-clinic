/**
 * backupSettingsService.ts
 * Sakhi Clinic — Backup Engine: persisted user preferences.
 *
 * The single source of truth for two independent doctor decisions:
 *   - destination: WHERE backups go (a StorageProvider id -- "local",
 *     "google-drive", and, later, whatever else gets registered in
 *     providerRegistry.ts).
 *   - mode: automatic vs. manual, and (for automatic) how often.
 *
 * Deliberately NOT derived from OAuth/connection state, and deliberately
 * NOT an in-memory variable -- connecting Google Drive only ever means
 * "Google Drive is available"; it must never silently change where
 * backups are stored (see completeGoogleDriveConnection.ts, which no
 * longer touches this at all). Every read here goes straight to
 * localStorage, so the preference survives a refresh, a browser restart,
 * and a fresh login exactly the same way -- there is no other code path
 * that can set the active destination.
 *
 * lastBackupAt/lastRestoreAt are deliberately NOT duplicated here --
 * storageHealthService.ts already owns those (backward compatibility);
 * this file only owns destination + mode.
 */

const STORAGE_KEY = "sakhi.backup.settings.v1";

export const LOCAL_DESTINATION_ID = "local";

/** Real values today; "before-update"/"before-restore" are recognized now
 * so the UI and this model don't need to change again once a scheduler is
 * added -- no scheduling actually runs for any of them yet (see the
 * architecture note in backupManager.ts's runAutoIfDue). */
export type BackupFrequency = "daily" | "weekly" | "before-update" | "before-restore";

export interface BackupSettings {
  /** A StorageProvider id -- see providerRegistry.ts. Defaults to local. */
  destination: string;
  autoBackupEnabled: boolean;
  frequency: BackupFrequency;
}

const DEFAULT_SETTINGS: BackupSettings = {
  destination: LOCAL_DESTINATION_ID,
  autoBackupEnabled: false,
  frequency: "daily",
};

function isValidFrequency(value: unknown): value is BackupFrequency {
  return value === "daily" || value === "weekly" || value === "before-update" || value === "before-restore";
}

export function getBackupSettings(): BackupSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      destination: typeof parsed.destination === "string" && parsed.destination ? parsed.destination : DEFAULT_SETTINGS.destination,
      autoBackupEnabled: Boolean(parsed.autoBackupEnabled),
      frequency: isValidFrequency(parsed.frequency) ? parsed.frequency : DEFAULT_SETTINGS.frequency,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeBackupSettings(settings: BackupSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore -- worst case a preference change doesn't persist across reload
  }
}

/** Explicit, doctor-initiated destination choice. The ONLY function in
 * this codebase that is allowed to change which provider backups go to. */
export function setBackupDestination(providerId: string): void {
  writeBackupSettings({ ...getBackupSettings(), destination: providerId });
}

export function setAutoBackupEnabled(enabled: boolean): void {
  writeBackupSettings({ ...getBackupSettings(), autoBackupEnabled: enabled });
}

export function setBackupFrequency(frequency: BackupFrequency): void {
  writeBackupSettings({ ...getBackupSettings(), frequency });
}
