const KEY_LAST_BACKUP_AT = "sakhi.health.lastBackupAt.v1";
const KEY_LAST_BACKUP_SIZE = "sakhi.health.lastBackupSizeBytes.v1";
const KEY_LAST_BACKUP_COUNTS = "sakhi.health.lastBackupCounts.v1";
const KEY_LAST_RESTORE_AT = "sakhi.health.lastRestoreAt.v1";
const DEFAULT_STALE_DAYS = 7;

export function recordBackupSuccess(exportedAtIso: string) {
  try {
    window.localStorage.setItem(KEY_LAST_BACKUP_AT, exportedAtIso);
  } catch {
    // ignore
  }
}

export function recordBackupSuccessDetails(input: {
  exportedAtIso: string;
  sizeBytes?: number;
  counts?: Record<string, number>;
}) {
  recordBackupSuccess(input.exportedAtIso);
  try {
    if (typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes)) {
      window.localStorage.setItem(KEY_LAST_BACKUP_SIZE, String(Math.max(0, Math.floor(input.sizeBytes))));
    }
    if (input.counts && typeof input.counts === "object") {
      window.localStorage.setItem(KEY_LAST_BACKUP_COUNTS, JSON.stringify(input.counts));
    }
  } catch {
    // ignore
  }
}

export function recordRestoreSuccess(restoredAtIso: string) {
  try {
    window.localStorage.setItem(KEY_LAST_RESTORE_AT, restoredAtIso);
  } catch {
    // ignore
  }
}

export function getLastBackupAt(): string | null {
  try {
    return window.localStorage.getItem(KEY_LAST_BACKUP_AT);
  } catch {
    return null;
  }
}

export function getLastBackupSizeBytes(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY_LAST_BACKUP_SIZE);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

export function getLastBackupCounts(): Record<string, number> | null {
  try {
    const raw = window.localStorage.getItem(KEY_LAST_BACKUP_COUNTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, number>;
  } catch {
    return null;
  }
}

export function getLastRestoreAt(): string | null {
  try {
    return window.localStorage.getItem(KEY_LAST_RESTORE_AT);
  } catch {
    return null;
  }
}

export function getBackupAgeDays(now = new Date()): number | null {
  const last = getLastBackupAt();
  if (!last) return null;
  const ts = Date.parse(last);
  if (!Number.isFinite(ts)) return null;
  const diffMs = now.getTime() - ts;
  return Math.max(0, Math.floor(diffMs / 86400000));
}

export function isBackupStale(staleAfterDays = DEFAULT_STALE_DAYS): boolean {
  const age = getBackupAgeDays();
  if (age == null) return true;
  return age >= staleAfterDays;
}

export function getRecommendedBackupCadenceDays(): number {
  return DEFAULT_STALE_DAYS;
}

export interface BackupHealthSummary {
  level: "healthy" | "attention" | "critical";
  message: string;
}

/**
 * Plain-language backup-health status, matching SettingsPage.tsx's
 * existing Backup Health Dashboard decision tree exactly (failed job >
 * stale backup > misconfigured destination > healthy) so
 * DashboardPage.tsx can show the same status without inventing a second
 * one. SettingsPage.tsx's own inline computation is left as-is in this
 * pass (it's synchronous, driven by state it already loads, and
 * touching it isn't required for the dashboard to reuse the same
 * decision logic) -- the two must be kept in sync by hand until a
 * follow-up unifies them onto this function too.
 */
export async function getBackupHealthSummary(): Promise<BackupHealthSummary> {
  const [{ getActiveProvider }, { LOCAL_DESTINATION_ID }, { listRecentJobs }, { googleOAuthService }] = await Promise.all([
    import("./backup/backupManager"),
    import("./backup/backupSettingsService"),
    import("./backup/backupJobService"),
    import("./backup/oauth/googleOAuthService"),
  ]);

  const [jobs, driveConnected] = await Promise.all([
    listRecentJobs(10),
    googleOAuthService.isAuthenticated(),
  ]);
  const failedJobCount = jobs.filter((j) => j.status === "failed").length;
  const activeProvider = getActiveProvider();
  const backupAgeDays = getBackupAgeDays();

  if (failedJobCount > 0) {
    return { level: "critical", message: `${failedJobCount} backup${failedJobCount > 1 ? "s" : ""} failed and need${failedJobCount > 1 ? "" : "s"} attention.` };
  }
  if (isBackupStale()) {
    return { level: "attention", message: backupAgeDays != null ? `Last backup was ${backupAgeDays} day${backupAgeDays === 1 ? "" : "s"} ago.` : "No backup has been taken yet." };
  }
  if (activeProvider.id !== LOCAL_DESTINATION_ID && !driveConnected) {
    return { level: "attention", message: `${activeProvider.label} is selected but not connected -- backups are saving to This Device instead.` };
  }
  return { level: "healthy", message: "Backups are up to date." };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export interface StorageEstimateSummary {
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** Thin, feature-detected wrapper around navigator.storage.estimate() --
 * used by both SettingsPage.tsx and DashboardPage.tsx so neither carries
 * its own copy of the try/catch/feature-detection boilerplate. */
export async function getStorageEstimate(): Promise<StorageEstimateSummary> {
  try {
    if (typeof navigator === "undefined" || !(navigator as any).storage?.estimate) {
      return { usageBytes: null, quotaBytes: null };
    }
    const estimate = await (navigator as any).storage.estimate();
    return {
      usageBytes: typeof estimate?.usage === "number" ? estimate.usage : null,
      quotaBytes: typeof estimate?.quota === "number" ? estimate.quota : null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}
