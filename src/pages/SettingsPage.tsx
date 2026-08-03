/**
 * SettingsPage.tsx
 * Sakhi Clinic — Operational Control Center
 *
 * Every action here calls into an existing service (backupService,
 * patientImportService, csvExportService, storageIntegrityService,
 * maintenanceRuntimeService, the Backup Engine) rather than reimplementing
 * backup/export/import logic. The Cloud Backup section talks to Google
 * Drive only through the StorageProvider/OAuthService abstractions --
 * this file has no Drive-specific code of its own, and shows an honest
 * "not configured" state rather than a fake "Connect" button, since no
 * OAuth client ID exists in this deployment yet.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Database,
  Users,
  Building2,
  Info,
  Activity,
  Cloud,
  CloudOff,
  Download,
  Upload,
  RefreshCw,
  LogOut,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { useUIStore, ActiveClinic } from "../store/uiStore";
import {
  exportBackup,
  listRemoteBackups,
  getLocalBackupSnapshotSummary,
  previewLocalRestore,
  previewRemoteRestore,
  confirmRestorePreview,
  cancelRestorePreview,
  deleteRemoteBackupFile,
  type BackupPreview,
} from "../services/backupService";
import { getLastBackupAt, getLastBackupSizeBytes, getLastRestoreAt, getBackupAgeDays, isBackupStale, formatBytes } from "../services/storageHealthService";
import { importPatientsFromCsv, PatientImportMode } from "../services/patientImportService";
import { exportPatientsCsv } from "../services/csvExportService";
import { runDexieHealthCheck, DexieHealthReport } from "../services/storageIntegrityService";
import { getMaintenanceRuntimeReport, MaintenanceRuntimeReport } from "../services/maintenanceRuntimeService";
import { getActiveProvider } from "../services/backup/backupManager";
import {
  getBackupSettings,
  setBackupDestination,
  setAutoBackupEnabled,
  setBackupFrequency,
  LOCAL_DESTINATION_ID,
  type BackupFrequency,
} from "../services/backup/backupSettingsService";
import { listRegisteredProviders, getProviderById } from "../services/backup/providers/providerRegistry";
import type { StorageProviderListEntry } from "../services/backup/storageProvider";
import { listRecentJobs } from "../services/backup/backupJobService";
import { retryEligibleBackupJobs } from "../services/backup/backupRetryService";
import { googleDriveProvider } from "../services/backup/providers/googleDriveProvider";
import { googleOAuthService } from "../services/backup/oauth/googleOAuthService";
import type { BackupJob } from "../services/db";

declare const __APP_VERSION__: string;

function formatJobStage(job: BackupJob): string {
  const last = job.events[job.events.length - 1];
  return last ? `${last.stage}: ${last.message}` : job.status;
}

const CLINICS: ActiveClinic[] = ["Dabholi", "City Light"];

function formatTs(iso: string | null): string {
  if (!iso) return "Not yet";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function voiceEngineSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition ?? (window as any).webkitSpeechRecognition);
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className="sakhi-row" style={{ justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
      <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
        <span className="sakhi-icon-btn" style={{ width: 36, height: 36, pointerEvents: "none" }}>
          <Icon size={18} />
        </span>
        <div>
          <div className="sakhi-body" style={{ fontWeight: 950, color: "#0f172a" }}>{title}</div>
          {subtitle && <div className="sakhi-caption">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "muted" | "brand";
}) {
  return (
    <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
      <span className="sakhi-caption">{label}</span>
      {typeof value === "string" || typeof value === "number" ? (
        <span className="sakhi-pill" data-tone={tone || "muted"}>{value}</span>
      ) : (
        value
      )}
    </div>
  );
}

function ComingSoonRow({ label, description }: { label: string; description: string }) {
  return (
    <div
      className="sakhi-row"
      style={{ justifyContent: "space-between", padding: "var(--space-2) 0", opacity: 0.6 }}
    >
      <div>
        <div className="sakhi-body" style={{ fontWeight: 900, fontSize: 13 }}>{label}</div>
        <div className="sakhi-caption" style={{ marginTop: 2 }}>{description}</div>
      </div>
      <span className="sakhi-pill" data-tone="muted" aria-label={`${label} - coming soon`}>
        Coming Soon
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const activeClinic = useUIStore((s) => s.activeClinic);
  const setActiveClinic = useUIStore((s) => s.setActiveClinic);

  const [loading, setLoading] = useState(true);
  const [backupSummary, setBackupSummary] = useState<{ count: number; filenames: string[] } | null>(null);
  const [health, setHealth] = useState<DexieHealthReport | null>(null);
  const [runtimeReport, setRuntimeReport] = useState<MaintenanceRuntimeReport | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [importMode, setImportMode] = useState<PatientImportMode>("skip-duplicates");
  const [importStatus, setImportStatus] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const [driveConnected, setDriveConnected] = useState(false);
  const [driveAccountEmail, setDriveAccountEmail] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<BackupJob[]>([]);
  const [failedJobCount, setFailedJobCount] = useState(0);
  const [cloudNote, setCloudNote] = useState<string>("");

  const driveConfigured = googleDriveProvider.available; // reflects isConfigured(), not sign-in state -- see the provider's own comment

  // Destination and mode are the doctor's own persisted preferences
  // (backupSettingsService.ts) -- completely independent of driveConnected
  // above. Connecting Google Drive only ever changes driveConnected; only
  // an explicit choice here changes backupSettings.destination.
  const [backupSettings, setBackupSettingsState] = useState(getBackupSettings());
  const activeProviderId = getActiveProvider().id; // derived straight from backupSettings.destination -- always in sync, never separate state

  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [drivePickerLoading, setDrivePickerLoading] = useState(false);
  const [driveBackups, setDriveBackups] = useState<StorageProviderListEntry[]>([]);

  // Validation preview shown before any restore actually runs -- see
  // backupManager.ts's previewLocalFile/previewRemoteBackup +
  // confirmPendingRestore. Replaces a blocking native window.confirm().
  const [pendingPreview, setPendingPreview] = useState<{ token: string; preview: BackupPreview } | null>(null);
  const [previewError, setPreviewError] = useState<string>("");

  // Live progress feedback for in-flight backup/restore operations,
  // sourced from the same BackupJob record Backup History already reads
  // -- polled rather than pushed, so no operation function signature had
  // to change to support it.
  const [progressText, setProgressText] = useState<string>("");
  const progressPollRef = useRef<number | null>(null);
  // Guards load()'s tail-end setState calls against firing after unmount --
  // load() is a plain async function (reused by 4 manual refresh call
  // sites, not just the mount effect), so its own promise chain can still
  // be in flight when the component using it goes away.
  const mountedRef = useRef(true);

  function stopProgressPolling() {
    if (progressPollRef.current != null) {
      window.clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }
    setProgressText("");
  }

  function startProgressPolling() {
    stopProgressPolling();
    progressPollRef.current = window.setInterval(() => {
      void listRecentJobs(1).then(([job]) => {
        if (!job || job.status !== "running") return;
        const last = job.events[job.events.length - 1];
        if (!last) return;
        const percent = last.progressPercent != null ? ` ${last.progressPercent}%` : "";
        setProgressText(`${last.message}${percent}`);
      });
    }, 400);
  }

  async function withProgress<T>(op: () => Promise<T>): Promise<T> {
    startProgressPolling();
    try {
      return await op();
    } finally {
      stopProgressPolling();
    }
  }

  const load = async () => {
    setLoading(true);
    try {
      setBackupSettingsState(getBackupSettings());

      try {
        const rawConnectResult = window.localStorage.getItem("sakhi.driveConnectResult.v1");
        if (rawConnectResult) {
          window.localStorage.removeItem("sakhi.driveConnectResult.v1");
          const connectResult = JSON.parse(rawConnectResult) as { ok: boolean; error?: string };
          setCloudNote(
            connectResult.ok
              ? "Google Drive connected. Choose it as your backup destination below to start saving backups there."
              : `Could not connect Google Drive: ${connectResult.error || "Unknown error"}`
          );
        }
      } catch {
        // ignore -- worst case the doctor just doesn't see the one-time note
      }

      const [summary, dexieHealth, runtime, connected, jobs] = await Promise.all([
        getLocalBackupSnapshotSummary(),
        runDexieHealthCheck(),
        getMaintenanceRuntimeReport({ includeRecentEvents: 0 }),
        googleOAuthService.isAuthenticated(),
        listRecentJobs(10),
      ]);
      if (!mountedRef.current) return;
      setBackupSummary(summary);
      setHealth(dexieHealth);
      setRuntimeReport(runtime);
      setDriveConnected(connected);
      setRecentJobs(jobs);
      setFailedJobCount(jobs.filter((j) => j.status === "failed").length);

      if (connected) {
        googleOAuthService
          .getAccountInfo()
          .then((info) => { if (mountedRef.current) setDriveAccountEmail(info?.email ?? null); })
          .catch(() => { if (mountedRef.current) setDriveAccountEmail(null); });
      } else {
        setDriveAccountEmail(null);
      }

      if (typeof navigator !== "undefined" && (navigator as any).storage?.estimate) {
        try {
          const estimate = await (navigator as any).storage.estimate();
          if (mountedRef.current) setStorageEstimate(estimate);
        } catch {
          if (mountedRef.current) setStorageEstimate(null);
        }
      }
    } catch (err) {
      console.error("[SettingsPage] Failed to load diagnostics:", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      stopProgressPolling();
    };
  }, []);

  const handleConnectDrive = async () => {
    setCloudNote("");
    if (!googleDriveProvider.available) {
      setCloudNote("Google Drive requires setup by the developer (a Google OAuth Client ID) before it can be connected. Local backups are unaffected and remain fully functional.");
      return;
    }
    setBusy("connect-drive");
    const url = await googleOAuthService.getAuthUrl();
    if (!url) {
      setCloudNote("Could not start Google sign-in.");
      setBusy(null);
      return;
    }
    // Deliberately leave `busy` set and skip a `finally` reset here: assigning
    // location.href only schedules navigation, it doesn't stop this script
    // running -- resetting busy immediately would re-enable the button during
    // that window, letting a fast second click call getAuthUrl() again and
    // overwrite the PKCE verifier this in-flight redirect's code_challenge
    // depends on (localStorage holds exactly one verifier at a time).
    window.location.href = url;
  };

  const handleDisconnectDrive = async () => {
    setBusy("disconnect-drive");
    try {
      await googleOAuthService.signOut();
      // Disconnecting only ever touches AUTH -- except this one explicit,
      // visible exception: if Google Drive was the chosen destination, it
      // is no longer usable at all, so leaving it selected would mean
      // every future backup silently fails until the doctor notices. This
      // is the opposite direction of the rule "connecting never changes
      // the destination" -- falling back to the always-available local
      // destination on disconnect is a safety measure, not an auto-promotion.
      if (backupSettings.destination === googleDriveProvider.id) {
        setBackupDestination(LOCAL_DESTINATION_ID);
        setCloudNote("Disconnected. Backup destination reset to This Device.");
      } else {
        setCloudNote("Disconnected. Backups will continue saving to your chosen destination.");
      }
      setShowDrivePicker(false);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleDestinationChange = (providerId: string) => {
    setBackupDestination(providerId);
    setBackupSettingsState(getBackupSettings());
    setShowDrivePicker(false);
    setCloudNote("");
  };

  const handleAutoBackupToggle = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    setBackupSettingsState(getBackupSettings());
  };

  const handleFrequencyChange = (frequency: BackupFrequency) => {
    setBackupFrequency(frequency);
    setBackupSettingsState(getBackupSettings());
  };

  const handleRetryFailedUploads = async () => {
    setBusy("retry-uploads");
    try {
      const summary = await retryEligibleBackupJobs();
      setCloudNote(
        summary.attempted === 0
          ? "No failed backups are due for retry right now."
          : `Retried ${summary.attempted}: ${summary.succeeded} succeeded, ${summary.stillFailed} still failed.`
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleExportBackup = async () => {
    setBusy("export-backup");
    try {
      await withProgress(() => exportBackup());
      await load();
    } finally {
      setBusy(null);
    }
  };

  /** Destination = Local: validates the picked file and shows the
   * preview panel below -- does NOT restore yet. See
   * backupManager.ts's previewLocalFile for why parsing/validation lives
   * in the backup engine, not here. */
  const handlePreviewLocalFile = async (file: File) => {
    setBusy("preview-restore");
    setPreviewError("");
    try {
      const result = await previewLocalRestore(file);
      if (result.ok && result.token && result.preview) {
        setPendingPreview({ token: result.token, preview: result.preview });
      } else {
        setPreviewError(result.error || "Could not read this backup file.");
      }
    } finally {
      setBusy(null);
    }
  };

  /** Destination = a remote provider: dispatches to listing instead of a
   * local file picker -- see backupManager.ts's listRestorableBackups
   * for why this lives in the backup engine, not here. */
  const handleOpenDrivePicker = async () => {
    setShowDrivePicker(true);
    setDrivePickerLoading(true);
    try {
      const entries = await listRemoteBackups();
      setDriveBackups(entries);
    } finally {
      setDrivePickerLoading(false);
    }
  };

  /** Destination = a remote provider: downloads + validates the chosen
   * backup and shows the preview panel below -- does NOT restore yet. */
  const handlePreviewRemoteBackup = async (filename: string) => {
    setBusy("preview-restore");
    setPreviewError("");
    try {
      const result = await withProgress(() => previewRemoteRestore(filename));
      if (result.ok && result.token && result.preview) {
        setPendingPreview({ token: result.token, preview: result.preview });
        setShowDrivePicker(false);
      } else {
        setPreviewError(result.error || "Could not download this backup.");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingPreview) return;
    setBusy("restore-backup");
    try {
      const result = await withProgress(() => confirmRestorePreview(pendingPreview.token));
      setPendingPreview(null);
      if (!result.ok) {
        setCloudNote(result.error || "Restore failed. The backup file looks invalid or incomplete.");
        return;
      }
      setCloudNote("Clinic backup restored.");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleCancelRestore = () => {
    cancelRestorePreview();
    setPendingPreview(null);
    setPreviewError("");
  };

  const handleDeleteDriveBackup = async (filename: string) => {
    const result = await deleteRemoteBackupFile(filename);
    if (!result.ok) {
      setCloudNote(result.error || `Could not delete ${filename}.`);
      return;
    }
    setDriveBackups((prev) => prev.filter((b) => b.filename !== filename));
  };

  const handleExportPatients = async () => {
    setBusy("export-patients");
    try {
      await exportPatientsCsv();
    } finally {
      setBusy(null);
    }
  };

  const handleImportPatients = async (file: File) => {
    setBusy("import-patients");
    setImportStatus("Importing…");
    try {
      const res = await importPatientsFromCsv(file, importMode);
      setImportStatus(`Imported ${res.imported} • Duplicates ${res.duplicates} • Skipped ${res.skipped} • Failed ${res.failed}`);
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const voiceSupported = voiceEngineSupported();

  // Backup Health Dashboard -- a single, plain-language status composed
  // entirely from signals already computed above; no new backend. Ordered
  // most-to-least urgent: a failed job is worse than a merely-stale
  // backup, which is worse than a misconfigured-but-not-yet-attempted
  // destination.
  const backupAgeDays = getBackupAgeDays();
  const backupHealth: { level: "healthy" | "attention" | "critical"; message: string } =
    failedJobCount > 0
      ? { level: "critical", message: `${failedJobCount} backup${failedJobCount > 1 ? "s" : ""} failed and need${failedJobCount > 1 ? "" : "s"} attention.` }
      : isBackupStale()
      ? { level: "attention", message: backupAgeDays != null ? `Last backup was ${backupAgeDays} day${backupAgeDays === 1 ? "" : "s"} ago.` : "No backup has been taken yet." }
      : activeProviderId !== LOCAL_DESTINATION_ID && !driveConnected
      ? { level: "attention", message: `${getActiveProvider().label} is selected but not connected -- backups are saving to This Device instead.` }
      : { level: "healthy", message: "Backups are up to date." };
  const backupHealthIcon = backupHealth.level === "healthy" ? ShieldCheck : backupHealth.level === "attention" ? ShieldAlert : ShieldX;
  const backupHealthColor = backupHealth.level === "healthy" ? "#15803d" : backupHealth.level === "attention" ? "#b45309" : "#b91c1c";
  const BackupHealthIcon = backupHealthIcon;

  return (
    <div className="sakhi-page" data-testid="settings-page">
      <div className="sakhi-stack">
        <header>
          <div className="sakhi-title">Settings</div>
          <div className="sakhi-caption" style={{ marginTop: 4 }}>
            Operational control center
          </div>
        </header>

        <ResponsiveContainer>
          <MobileSection>
            {/* ================= Backup & Restore ================= */}
            <MobileCard>
              <SectionHeader icon={Database} title="Backup & Restore" subtitle="Where your clinic data is protected" />

              {/* -- Backup Health Dashboard: one plain-language status, no new backend -- */}
              <div
                className="sakhi-row"
                style={{ gap: 8, alignItems: "center", padding: "var(--space-2)", borderRadius: 10, background: `${backupHealthColor}14`, marginBottom: "var(--space-3)" }}
              >
                <BackupHealthIcon size={16} color={backupHealthColor} />
                <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 800, color: backupHealthColor }}>
                  {backupHealth.message}
                </span>
              </div>

              {/* -- Google Drive: authentication only, never destination -- */}
              <div className="sakhi-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                  {driveConnected ? <Cloud size={18} /> : <CloudOff size={18} />}
                  <div>
                    <div className="sakhi-body" style={{ fontWeight: 900, fontSize: 13 }}>Google Drive</div>
                    <div className="sakhi-caption">
                      {driveConnected ? `Connected${driveAccountEmail ? ` · ${driveAccountEmail}` : ""}` : driveConfigured ? "Not connected" : "Not configured for this deployment"}
                    </div>
                  </div>
                </div>
                {driveConnected ? (
                  <button
                    type="button"
                    onClick={() => void handleDisconnectDrive()}
                    disabled={busy === "disconnect-drive"}
                    className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                    style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <LogOut size={14} />
                    {busy === "disconnect-drive" ? "Disconnecting…" : "Disconnect"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleConnectDrive()}
                    disabled={busy === "connect-drive" || !driveConfigured}
                    className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                    style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <Cloud size={14} />
                    {busy === "connect-drive" ? "Connecting…" : "Connect Drive"}
                  </button>
                )}
              </div>

              {/* -- Destination: the doctor's own explicit, persisted choice -- */}
              <div style={{ marginTop: "var(--space-3)" }}>
                <div className="sakhi-caption" style={{ marginBottom: 6 }}>Backup Destination</div>
                <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {listRegisteredProviders().map((p) => {
                    const disabled = p.id !== LOCAL_DESTINATION_ID && !p.available;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                        data-selected={String(backupSettings.destination === p.id)}
                        data-tone="brand"
                        aria-pressed={backupSettings.destination === p.id}
                        disabled={disabled}
                        title={disabled ? `${p.label} is not connected yet` : undefined}
                        onClick={() => handleDestinationChange(p.id)}
                      >
                        {p.id === LOCAL_DESTINATION_ID ? <HardDrive size={14} /> : <Cloud size={14} />}
                        {p.id === LOCAL_DESTINATION_ID ? "This Device" : p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="sakhi-caption" style={{ marginTop: 6 }}>
                  More destinations coming soon: OneDrive, Dropbox, Amazon S3, iCloud.
                </div>
              </div>

              {/* -- Backup Mode: independent from both auth and destination -- */}
              <div style={{ marginTop: "var(--space-3)" }}>
                <div className="sakhi-caption" style={{ marginBottom: 6 }}>Backup Mode</div>
                <label className="sakhi-row" style={{ gap: 8, cursor: "pointer", width: "fit-content" }}>
                  <input
                    type="checkbox"
                    checked={backupSettings.autoBackupEnabled}
                    onChange={(e) => handleAutoBackupToggle(e.target.checked)}
                  />
                  <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 800 }}>Automatic Backup</span>
                </label>
                {backupSettings.autoBackupEnabled && (
                  <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {(["daily", "weekly"] as BackupFrequency[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                        data-selected={String(backupSettings.frequency === f)}
                        data-tone="brand"
                        onClick={() => handleFrequencyChange(f)}
                      >
                        {f === "daily" ? "Daily" : "Weekly"}
                      </button>
                    ))}
                  </div>
                )}
                {backupSettings.autoBackupEnabled && backupSettings.destination !== LOCAL_DESTINATION_ID && !driveConnected && (
                  <div className="sakhi-caption" style={{ marginTop: 6, color: "#b45309", fontWeight: 800 }}>
                    {getActiveProvider().label} isn't connected right now -- automatic backups will save to This Device until it's reconnected.
                  </div>
                )}
              </div>

              {/* -- Status -- */}
              <div className="sakhi-stack-tight" style={{ marginTop: "var(--space-3)" }}>
                <SettingRow
                  label="Last backup"
                  value={formatTs(getLastBackupAt())}
                  tone={getLastBackupAt() ? "success" : "muted"}
                />
                <SettingRow label="Location" value={activeProviderId === LOCAL_DESTINATION_ID ? "This Device" : getActiveProvider().label} />
                <SettingRow label="Size" value={formatBytes(getLastBackupSizeBytes())} />
                <SettingRow label="Last restore" value={formatTs(getLastRestoreAt())} />
                <SettingRow
                  label="Local snapshots"
                  value={backupSummary ? `${backupSummary.count} stored` : loading ? "Loading…" : "—"}
                />
                {failedJobCount > 0 && (
                  <SettingRow label="Failed backups" value={`${failedJobCount} awaiting retry`} tone="brand" />
                )}
              </div>

              {activeProviderId !== LOCAL_DESTINATION_ID && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)" }}>
                  Capabilities: upload, download, delete, list
                  {googleDriveProvider.capabilities.supportsStreaming ? ", progress reporting" : ""}. No versioning, incremental sync, or
                  conflict resolution yet -- every backup is a full upload.
                </div>
              )}

              {cloudNote && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#475569", fontWeight: 800 }}>
                  {cloudNote}
                </div>
              )}

              {/* -- Operations: dispatched by BackupManager based on the
                   active provider, not branched here -- this file only
                   decides which WIDGET to show (a native file input has no
                   remote equivalent), never how export/restore itself
                   behaves. -- */}
              <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-3)", alignItems: "center" }}>
                {activeProviderId === LOCAL_DESTINATION_ID ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleExportBackup()}
                      disabled={busy === "export-backup"}
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <Download size={16} />
                      {busy === "export-backup" ? "Exporting…" : "Export Backup"}
                    </button>
                    <label
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                    >
                      <Upload size={16} />
                      {busy === "preview-restore" ? "Reading…" : "Restore Backup"}
                      <input
                        type="file"
                        accept=".json,application/json"
                        style={{ display: "none" }}
                        disabled={busy === "preview-restore"}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          void handlePreviewLocalFile(f).finally(() => {
                            e.currentTarget.value = "";
                          });
                        }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleExportBackup()}
                      disabled={busy === "export-backup"}
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <Cloud size={16} />
                      {busy === "export-backup" ? "Backing up…" : "Backup Now"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenDrivePicker()}
                      disabled={busy === "preview-restore"}
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <Upload size={16} />
                      {`Restore from ${getActiveProvider().label}`}
                    </button>
                  </>
                )}
                {failedJobCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRetryFailedUploads()}
                    disabled={busy === "retry-uploads"}
                    className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                    style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <RefreshCw size={16} />
                    {busy === "retry-uploads" ? "Retrying…" : "Retry Failed Uploads"}
                  </button>
                )}
                {progressText && (
                  <span className="sakhi-caption" style={{ fontWeight: 800, color: "#0d7377" }}>
                    {progressText}
                  </span>
                )}
              </div>

              {previewError && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#b91c1c", fontWeight: 800 }}>
                  {previewError}
                </div>
              )}

              {/* -- Backup validation preview: shown after a file/backup is
                   chosen, before anything is restored. Replaces a blocking
                   native window.confirm() with real in-app detail the
                   doctor can actually review. -- */}
              {pendingPreview && (
                <div
                  className="sakhi-stack-tight"
                  style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", border: "1px solid #fbbf24", borderRadius: 12, background: "#fffbeb" }}
                >
                  <div className="sakhi-body" style={{ fontWeight: 950, fontSize: 13, color: "#92400e" }}>
                    Review before restoring
                  </div>
                  <SettingRow label="File" value={pendingPreview.preview.filename} />
                  <SettingRow label="Exported" value={formatTs(pendingPreview.preview.exportedAt) || "Unknown date"} />
                  <SettingRow label="Device" value={pendingPreview.preview.deviceId || "Unknown device"} />
                  <SettingRow label="Patients" value={pendingPreview.preview.patients} />
                  <SettingRow label="Consultations" value={pendingPreview.preview.consultations} />
                  <SettingRow
                    label="Integrity check"
                    value={pendingPreview.preview.checksumStatus === "valid" ? "Verified" : "Not available for this file"}
                    tone={pendingPreview.preview.checksumStatus === "valid" ? "success" : "muted"}
                  />
                  <div className="sakhi-caption" style={{ marginTop: 4, color: "#92400e", fontWeight: 800 }}>
                    This will overwrite ALL existing clinic data on this device.
                  </div>
                  <div className="sakhi-row" style={{ gap: 10, marginTop: "var(--space-2)" }}>
                    <button
                      type="button"
                      onClick={() => void handleConfirmRestore()}
                      disabled={busy === "restore-backup"}
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 40, width: "auto", background: "#b91c1c", color: "#fff", borderColor: "#b91c1c" }}
                    >
                      {busy === "restore-backup" ? "Restoring…" : "Confirm Restore"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelRestore}
                      disabled={busy === "restore-backup"}
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 40, width: "auto" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* -- Remote restore picker: list -> choose -> validate -> preview -- */}
              {showDrivePicker && (
                <div className="sakhi-stack-tight" style={{ marginTop: "var(--space-3)", padding: "var(--space-2)", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                  <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
                    <span className="sakhi-body" style={{ fontWeight: 900, fontSize: 13 }}>Choose a backup to restore</span>
                    <div className="sakhi-row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        title="Refresh"
                        className="sakhi-caption"
                        style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                        disabled={drivePickerLoading}
                        onClick={() => void handleOpenDrivePicker()}
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button type="button" className="sakhi-caption" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowDrivePicker(false)}>
                        Close
                      </button>
                    </div>
                  </div>
                  {drivePickerLoading ? (
                    <div className="sakhi-caption">Loading backups from {getActiveProvider().label}…</div>
                  ) : driveBackups.length === 0 ? (
                    <div className="sakhi-caption">No backups found on {getActiveProvider().label}.</div>
                  ) : (
                    driveBackups.map((entry) => (
                      <div key={entry.filename} className="sakhi-row" style={{ justifyContent: "space-between", padding: "var(--space-2) 0", borderTop: "1px solid #f1f5f9" }}>
                        <div>
                          <div className="sakhi-body" style={{ fontSize: 13, fontWeight: 800 }}>{entry.filename}</div>
                          <div className="sakhi-caption">
                            {entry.createdAt ? formatTs(entry.createdAt) : "Date unknown"} · {formatBytes(entry.sizeBytes)}
                          </div>
                        </div>
                        <div className="sakhi-row" style={{ gap: 6 }}>
                          <button
                            type="button"
                            disabled={busy === "preview-restore"}
                            className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                            style={{ minHeight: 36, width: "auto" }}
                            onClick={() => void handlePreviewRemoteBackup(entry.filename)}
                          >
                            {busy === "preview-restore" ? "Checking…" : "Restore"}
                          </button>
                          {googleDriveProvider.capabilities.supportsDelete && (
                            <button
                              type="button"
                              title={`Delete ${entry.filename} from ${getActiveProvider().label}`}
                              className="sakhi-icon-btn"
                              style={{ width: 36, height: 36 }}
                              onClick={() => void handleDeleteDriveBackup(entry.filename)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {recentJobs.length > 0 && (
                <>
                  <div className="sakhi-caption" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                    Backup History
                  </div>
                  <div className="sakhi-progress-rail">
                    {recentJobs.map((job) => {
                      const providerLabel = getProviderById(job.providerId)?.label ?? (job.providerId === LOCAL_DESTINATION_ID ? "This Device" : job.providerId);
                      return (
                        <div key={job.id} className="sakhi-progress-card">
                          <div className="sakhi-progress-title">
                            <div className="sakhi-progress-title-left">
                              <span className="sakhi-progress-dot" data-state={job.status === "succeeded" ? "done" : job.status === "failed" ? "todo" : "active"} />
                              <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>
                                {job.kind === "restore" ? "Restore" : "Backup"} · {providerLabel}
                              </span>
                            </div>
                            <span className="sakhi-pill" data-tone={job.status === "succeeded" ? "success" : job.status === "failed" ? "brand" : "muted"}>
                              {job.status}
                            </span>
                          </div>
                          <div className="sakhi-progress-snippet">
                            {formatTs(job.completedAt || job.createdAt)}
                            {job.sizeBytes != null ? ` · ${formatBytes(job.sizeBytes)}` : ""}
                          </div>
                          <div className="sakhi-progress-snippet">{formatJobStage(job)}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </MobileCard>

            {/* ================= Patient Data ================= */}
            <MobileCard>
              <SectionHeader icon={Users} title="Patient Data" subtitle="Bring patients in or take them out via CSV" />

              <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {(["skip-duplicates", "merge-duplicates", "import-all"] as PatientImportMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                    data-selected={String(importMode === mode)}
                    data-tone="brand"
                    onClick={() => setImportMode(mode)}
                  >
                    {mode === "skip-duplicates" ? "Skip duplicates" : mode === "merge-duplicates" ? "Merge duplicates" : "Import all"}
                  </button>
                ))}
              </div>

              {importStatus && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#475569", fontWeight: 800 }}>
                  {importStatus}
                </div>
              )}

              <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-3)" }}>
                <label
                  className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                  style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                >
                  <Upload size={16} />
                  {busy === "import-patients" ? "Importing…" : "Import Patients"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    disabled={busy === "import-patients"}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void handleImportPatients(f).finally(() => {
                        e.currentTarget.value = "";
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleExportPatients()}
                  disabled={busy === "export-patients"}
                  className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                  style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <Download size={16} />
                  {busy === "export-patients" ? "Exporting…" : "Export Patients"}
                </button>
              </div>
            </MobileCard>

            {/* ================= Clinic ================= */}
            <MobileCard>
              <SectionHeader icon={Building2} title="Clinic" subtitle="Where you're seeing patients today" />
              <div className="sakhi-stack-tight">
                <SettingRow
                  label="Clinic locations"
                  value={
                    <div className="sakhi-row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {CLINICS.map((c) => (
                        <span key={c} className="sakhi-pill" data-tone="muted">{c}</span>
                      ))}
                    </div>
                  }
                />
              </div>

              <div className="sakhi-caption" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                Active clinic
              </div>
              <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {CLINICS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                    data-selected={String(activeClinic === c)}
                    data-tone="brand"
                    aria-pressed={activeClinic === c}
                    onClick={() => setActiveClinic(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </MobileCard>

            {/* ================= Application ================= */}
            <MobileCard>
              <SectionHeader icon={Info} title="Application" subtitle="What's installed on this device" />
              <div className="sakhi-stack-tight">
                <SettingRow label="Version" value={typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"} />
                <SettingRow
                  label="Build"
                  value={typeof import.meta !== "undefined" && (import.meta as any).env?.PROD ? "Production" : "Development"}
                />
                <SettingRow
                  label="Database version"
                  value={health?.schemaVersion != null ? `v${health.schemaVersion}` : loading ? "Loading…" : "Unknown"}
                  tone={health?.ok ? "success" : "muted"}
                />
                <SettingRow
                  label="Storage usage"
                  value={
                    storageEstimate?.usage != null
                      ? `${formatBytes(storageEstimate.usage)}${storageEstimate.quota ? ` of ${formatBytes(storageEstimate.quota)}` : ""}`
                      : loading
                      ? "Loading…"
                      : "Not available"
                  }
                />
              </div>
            </MobileCard>

            {/* ================= Diagnostics ================= */}
            <MobileCard>
              <SectionHeader icon={Activity} title="Diagnostics" subtitle="Local-only health checks, safe for production" />
              <div className="sakhi-stack-tight">
                <SettingRow
                  label="Runtime status"
                  value={runtimeReport ? `Outbox: ${runtimeReport.outbox.pending} pending / ${runtimeReport.outbox.failed} failed` : loading ? "Loading…" : "—"}
                />
                <SettingRow
                  label="Voice engine status"
                  value={voiceSupported ? "Available" : "Not supported on this browser"}
                  tone={voiceSupported ? "success" : "muted"}
                />
                <SettingRow
                  label="Storage health"
                  value={health ? (health.ok ? "OK" : "Needs attention") : loading ? "Loading…" : "Unknown"}
                  tone={health?.ok ? "success" : health ? "muted" : "muted"}
                />
              </div>
              {health && !health.ok && health.error && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#b91c1c", fontWeight: 800 }}>
                  {health.error}
                </div>
              )}
            </MobileCard>

            {/* ================= Coming Soon ================= */}
            <MobileCard>
              <SectionHeader icon={Cloud} title="Coming Soon" subtitle="Planned for a future release" />
              <div className="sakhi-stack-tight">
                <ComingSoonRow label="Backup Version History" description="Browse and restore from multiple past cloud backups, not just the latest" />
                <ComingSoonRow label="Multi-Device Sync" description="Keep multiple devices in sync automatically, with conflict resolution" />
              </div>
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
