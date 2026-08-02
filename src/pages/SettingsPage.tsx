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

import React, { useEffect, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { useUIStore, ActiveClinic } from "../store/uiStore";
import { exportBackup, importBackup, listRemoteBackups, restoreFromRemote, getLocalBackupSnapshotSummary } from "../services/backupService";
import { getLastBackupAt, getLastBackupSizeBytes, getLastRestoreAt } from "../services/storageHealthService";
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
import { listRegisteredProviders } from "../services/backup/providers/providerRegistry";
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

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
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
  const [cloudJobs, setCloudJobs] = useState<BackupJob[]>([]);
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
      setBackupSummary(summary);
      setHealth(dexieHealth);
      setRuntimeReport(runtime);
      setDriveConnected(connected);
      setCloudJobs(jobs.filter((j) => j.providerId !== "local"));
      setFailedJobCount(jobs.filter((j) => j.status === "failed").length);

      if (connected) {
        googleOAuthService
          .getAccountInfo()
          .then((info) => setDriveAccountEmail(info?.email ?? null))
          .catch(() => setDriveAccountEmail(null));
      } else {
        setDriveAccountEmail(null);
      }

      if (typeof navigator !== "undefined" && (navigator as any).storage?.estimate) {
        try {
          const estimate = await (navigator as any).storage.estimate();
          setStorageEstimate(estimate);
        } catch {
          setStorageEstimate(null);
        }
      }
    } catch (err) {
      console.error("[SettingsPage] Failed to load diagnostics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
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
      await exportBackup();
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreBackup = async (file: File) => {
    setBusy("restore-backup");
    try {
      await importBackup(file);
      await load();
    } finally {
      setBusy(null);
    }
  };

  /** Destination = a remote provider: dispatches to listing instead of a
   * local file picker -- see backupManager.ts's runImportFromProvider /
   * listRestorableBackups for why this lives in the backup engine, not here. */
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

  const handleRestoreFromDrive = async (filename: string) => {
    setBusy("restore-backup");
    try {
      const result = await restoreFromRemote(filename);
      if (!result.ok) {
        setCloudNote(result.error || "Could not restore from Google Drive.");
        return;
      }
      setShowDrivePicker(false);
      await load();
    } finally {
      setBusy(null);
    }
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
              <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-3)" }}>
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
                      {busy === "restore-backup" ? "Restoring…" : "Restore Backup"}
                      <input
                        type="file"
                        accept=".json,application/json"
                        style={{ display: "none" }}
                        disabled={busy === "restore-backup"}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          void handleRestoreBackup(f).finally(() => {
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
                      disabled={busy === "restore-backup"}
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <Upload size={16} />
                      {busy === "restore-backup" ? "Restoring…" : `Restore from ${getActiveProvider().label}`}
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
              </div>

              {/* -- Remote restore picker: list -> choose -> download -> restore -- */}
              {showDrivePicker && (
                <div className="sakhi-stack-tight" style={{ marginTop: "var(--space-3)", padding: "var(--space-2)", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                  <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
                    <span className="sakhi-body" style={{ fontWeight: 900, fontSize: 13 }}>Choose a backup to restore</span>
                    <button type="button" className="sakhi-caption" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowDrivePicker(false)}>
                      Close
                    </button>
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
                        <button
                          type="button"
                          disabled={busy === "restore-backup"}
                          className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                          style={{ minHeight: 36, width: "auto" }}
                          onClick={() => void handleRestoreFromDrive(entry.filename)}
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {cloudJobs.length > 0 && (
                <>
                  <div className="sakhi-caption" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                    Cloud backup history
                  </div>
                  <div className="sakhi-progress-rail">
                    {cloudJobs.map((job) => (
                      <div key={job.id} className="sakhi-progress-card">
                        <div className="sakhi-progress-title">
                          <div className="sakhi-progress-title-left">
                            <span className="sakhi-progress-dot" data-state={job.status === "succeeded" ? "done" : job.status === "failed" ? "todo" : "active"} />
                            <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>{job.kind}</span>
                          </div>
                          <span className="sakhi-pill" data-tone={job.status === "succeeded" ? "success" : job.status === "failed" ? "brand" : "muted"}>
                            {job.status}
                          </span>
                        </div>
                        <div className="sakhi-progress-snippet">{formatJobStage(job)}</div>
                      </div>
                    ))}
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
