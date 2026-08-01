/**
 * SettingsPage.tsx
 * Sakhi Clinic — Operational Control Center
 *
 * Release 1.0 scope only. Every action here calls into an existing service
 * (backupService, patientImportService, csvExportService,
 * storageIntegrityService, maintenanceRuntimeService) rather than
 * reimplementing backup/export/import logic. Sections not yet built
 * (Google Drive Sync, Automatic Backup, Cloud Sync) are shown disabled,
 * not hidden, per the roadmap's own module sequencing.
 */

import React, { useEffect, useState } from "react";
import {
  Database,
  Users,
  Building2,
  Info,
  Activity,
  Cloud,
  Download,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { useUIStore, ActiveClinic } from "../store/uiStore";
import { exportBackup, importBackup, getLocalBackupSnapshotSummary } from "../services/backupService";
import { getLastBackupAt, getLastBackupSizeBytes, getLastRestoreAt } from "../services/storageHealthService";
import { importPatientsFromCsv, PatientImportMode } from "../services/patientImportService";
import { exportPatientsCsv } from "../services/csvExportService";
import { runDexieHealthCheck, DexieHealthReport } from "../services/storageIntegrityService";
import { getMaintenanceRuntimeReport, MaintenanceRuntimeReport } from "../services/maintenanceRuntimeService";

declare const __APP_VERSION__: string;

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

  const load = async () => {
    setLoading(true);
    try {
      const [summary, dexieHealth, runtime] = await Promise.all([
        getLocalBackupSnapshotSummary(),
        runDexieHealthCheck(),
        getMaintenanceRuntimeReport({ includeRecentEvents: 0 }),
      ]);
      setBackupSummary(summary);
      setHealth(dexieHealth);
      setRuntimeReport(runtime);

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
            {/* ================= Data Protection ================= */}
            <MobileCard>
              <SectionHeader icon={Database} title="Data Protection" subtitle="Export and restore your clinic data" />
              <div className="sakhi-stack-tight">
                <SettingRow
                  label="Last backup"
                  value={formatTs(getLastBackupAt())}
                  tone={getLastBackupAt() ? "success" : "muted"}
                />
                <SettingRow label="Last restore" value={formatTs(getLastRestoreAt())} />
                <SettingRow label="Last backup size" value={formatBytes(getLastBackupSizeBytes())} />
                <SettingRow
                  label="Local snapshots"
                  value={backupSummary ? `${backupSummary.count} stored` : loading ? "Loading…" : "—"}
                />
              </div>

              <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-3)" }}>
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
              </div>
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
                <ComingSoonRow label="Google Drive Sync" description="Automatic off-device backup to your own Google Drive" />
                <ComingSoonRow label="Automatic Backup" description="Scheduled backups without manual export" />
                <ComingSoonRow label="Cloud Sync" description="Keep multiple devices in sync automatically" />
              </div>
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
