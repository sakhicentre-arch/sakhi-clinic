import { useEffect, useMemo, useState } from "react";
import { getMaintenanceRuntimeReport } from "../../services/maintenanceRuntimeService";
import { getRecentOperationalEvents, pruneOperationalEvents } from "../../services/operationalEventLogService";
import type { OperationalEvent } from "../../services/db";
import { exportBackup, importBackup, getLocalBackupSnapshotSummary } from "../../services/backupService";
import { getLastBackupAt, getLastBackupCounts, getLastBackupSizeBytes, getLastRestoreAt } from "../../services/storageHealthService";
import { importPatientsFromCsv, PatientImportMode } from "../../services/patientImportService";
import { exportAppointmentsCsv, exportConsultationSummaryCsv, exportPatientsCsv } from "../../services/csvExportService";
import { pruneSynced, retryFailed } from "../../services/outboxMaintenanceService";

type Props = {
  open: boolean;
  onClose: () => void;
};

const formatTs = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
};

export default function DiagnosticsPanel({ open, onClose }: Props) {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Awaited<ReturnType<typeof getMaintenanceRuntimeReport>> | null>(null);
  const [backupSummary, setBackupSummary] = useState<{ count: number; filenames: string[] } | null>(null);
  const [importMode, setImportMode] = useState<PatientImportMode>("skip-duplicates");
  const [importStatus, setImportStatus] = useState<string>("");

  const errorEvents = useMemo(
    () => events.filter((e) => e.level === "error" || String(e.type).includes(".failure") || String(e.type).includes("unhandled")),
    [events]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [recent, rep, backups] = await Promise.all([
        getRecentOperationalEvents(60),
        getMaintenanceRuntimeReport({ includeRecentEvents: 25 }),
        getLocalBackupSnapshotSummary(),
      ]);
      setEvents(recent);
      setReport(rep);
      setBackupSummary(backups);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Diagnostics"
      style={{ position: "fixed", inset: 0, zIndex: 5000 }}
    >
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.55)" }} />

      <div
        className="sakhi-sheet-enter"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "calc(var(--app-vh, 1vh) * 100 - 60px)",
          overflow: "auto",
          background: "var(--surface)",
          borderTopLeftRadius: "var(--radius-4)",
          borderTopRightRadius: "var(--radius-4)",
          boxShadow: "0 -20px 60px rgba(15, 23, 42, 0.22)",
        }}
      >
        <div style={{ padding: "var(--space-3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="sakhi-title">Diagnostics</div>
            <div className="sakhi-caption" style={{ marginTop: 2 }}>
              Hidden panel • local-only • safe for production
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => void load()}
              className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring sakhi-ripple"
              style={{ minHeight: 40 }}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await pruneOperationalEvents(200).catch(() => {});
                void load();
              }}
              className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring sakhi-ripple"
              style={{ minHeight: 40 }}
            >
              Prune
            </button>
            <button
              type="button"
              onClick={onClose}
              className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring sakhi-ripple"
              style={{ minHeight: 40 }}
            >
              Close
            </button>
          </div>
        </div>

        {report && (
          <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>
            <div className="sakhi-surface-muted" style={{ padding: "var(--space-3)" }}>
              <div className="sakhi-label" style={{ color: "#94a3b8", marginBottom: "var(--space-2)" }}>Runtime health</div>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
                <span className="sakhi-pill">Outbox: {report.outbox.pending} pending / {report.outbox.failed} failed</span>
                <span className="sakhi-pill">Dexie: {report.storage.dexie.ok ? "OK" : "WARN"}</span>
                <span className="sakhi-pill">Backup stale: {report.backup.stale ? "Yes" : "No"}</span>
              </div>
            </div>

            <div className="sakhi-surface-muted" style={{ padding: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <div className="sakhi-label" style={{ color: "#94a3b8", marginBottom: "var(--space-2)" }}>Sync actions</div>
              <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={async () => {
                    await retryFailed().catch(() => {});
                    void load();
                  }}
                  className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                  style={{ minHeight: 44 }}
                >
                  Retry failed sync
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await pruneSynced(0).catch(() => {});
                    void load();
                  }}
                  className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                  style={{ minHeight: 44 }}
                >
                  Clear completed outbox
                </button>
              </div>
              <div className="sakhi-caption" style={{ marginTop: "var(--space-2)" }}>
                Note: this does not delete local clinic data. It only manages the sync queue.
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>
          <div className="sakhi-surface" style={{ padding: "var(--space-3)" }}>
            <div className="sakhi-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Backups</div>
                <div className="sakhi-caption" style={{ marginTop: 2 }}>Export / restore clinic data safely</div>
              </div>
              <span className="sakhi-pill" data-tone={report?.backup.stale ? "muted" : "success"}>
                {report?.backup.stale ? "Needs backup" : "Healthy"}
              </span>
            </div>

            <div className="sakhi-stack-tight" style={{ marginTop: "var(--space-3)" }}>
              <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
                <span className="sakhi-caption">Last backup</span>
                <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>
                  {getLastBackupAt() ? formatTs(getLastBackupAt() as string) : "Not yet"}
                </span>
              </div>
              <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
                <span className="sakhi-caption">Last restore</span>
                <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>
                  {getLastRestoreAt() ? formatTs(getLastRestoreAt() as string) : "—"}
                </span>
              </div>
              <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
                <span className="sakhi-caption">Backup size</span>
                <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>
                  {(() => {
                    const b = getLastBackupSizeBytes();
                    if (b == null) return "—";
                    const kb = b / 1024;
                    if (kb < 1024) return `${kb.toFixed(0)} KB`;
                    return `${(kb / 1024).toFixed(2)} MB`;
                  })()}
                </span>
              </div>
              <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
                <span className="sakhi-caption">Local snapshots</span>
                <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>
                  {backupSummary ? `${backupSummary.count} stored` : "—"}
                </span>
              </div>
            </div>

            {getLastBackupCounts() && (
              <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginTop: "var(--space-3)" }}>
                {Object.entries(getLastBackupCounts() as Record<string, number>)
                  .filter(([k]) => ["patients", "consultations", "appointments"].includes(k))
                  .map(([k, v]) => (
                    <span key={k} className="sakhi-pill" data-tone="muted">
                      {k}: {v}
                    </span>
                  ))}
              </div>
            )}

            <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-3)" }}>
              <button
                type="button"
                onClick={() => void exportBackup()}
                className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ minHeight: 44 }}
              >
                Export clinic backup
              </button>
              <label
                className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                Restore clinic backup
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void importBackup(f).finally(() => {
                      // allow re-selecting same file
                      e.currentTarget.value = "";
                      void load();
                    });
                  }}
                />
              </label>
            </div>

            <div className="sakhi-divider" style={{ width: "100%", height: 1, marginTop: "var(--space-3)" }} />

            <div className="sakhi-row" style={{ justifyContent: "space-between", alignItems: "baseline", marginTop: "var(--space-3)" }}>
              <div className="sakhi-body" style={{ fontWeight: 950 }}>Patient CSV</div>
              <span className="sakhi-caption">For import/export with Excel</span>
            </div>

            <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
              <button
                type="button"
                className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                data-selected={String(importMode === "skip-duplicates")}
                data-tone="brand"
                onClick={() => setImportMode("skip-duplicates")}
              >
                Skip duplicates
              </button>
              <button
                type="button"
                className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                data-selected={String(importMode === "merge-duplicates")}
                data-tone="brand"
                onClick={() => setImportMode("merge-duplicates")}
              >
                Merge duplicates
              </button>
              <button
                type="button"
                className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                data-selected={String(importMode === "import-all")}
                data-tone="brand"
                onClick={() => setImportMode("import-all")}
              >
                Import all
              </button>
            </div>

            {importStatus && (
              <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#475569", fontWeight: 800 }}>
                {importStatus}
              </div>
            )}

            <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
              <button
                type="button"
                onClick={() => void exportPatientsCsv()}
                className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ minHeight: 44 }}
              >
                Export patients CSV
              </button>
              <label
                className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                Import patients CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setImportStatus("Importing…");
                    void importPatientsFromCsv(f, importMode)
                      .then((res) => {
                        setImportStatus(`Imported ${res.imported} • Duplicates ${res.duplicates} • Skipped ${res.skipped} • Failed ${res.failed}`);
                      })
                      .catch((err) => {
                        setImportStatus(err instanceof Error ? err.message : String(err));
                      })
                      .finally(() => {
                        e.currentTarget.value = "";
                      });
                  }}
                />
              </label>
            </div>

            <div className="sakhi-row" style={{ gap: 10, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
              <button
                type="button"
                onClick={() => void exportAppointmentsCsv()}
                className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ minHeight: 44 }}
              >
                Export appointments CSV
              </button>
              <button
                type="button"
                onClick={() => void exportConsultationSummaryCsv()}
                className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ minHeight: 44 }}
              >
                Export consultations CSV
              </button>
            </div>

            <div className="sakhi-caption" style={{ marginTop: "var(--space-2)" }}>
              Tip: upload the exported backup file to OneDrive/Google Drive for off-device safety.
            </div>
          </div>
        </div>

        <div style={{ padding: "0 var(--space-3) var(--space-4)" }}>
          <div className="sakhi-row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div className="sakhi-body" style={{ fontWeight: 950 }}>Latest errors</div>
            <div className="sakhi-caption">{errorEvents.length} errors (showing most recent)</div>
          </div>

          {errorEvents.length === 0 ? (
            <div className="sakhi-surface-flat" style={{ marginTop: "var(--space-3)", padding: "var(--space-3)" }}>
              <div className="sakhi-caption">No runtime errors captured in this session.</div>
            </div>
          ) : (
            <div className="sakhi-progress-rail" style={{ marginTop: "var(--space-3)" }}>
              {errorEvents.slice(0, 12).map((e) => (
                <div key={e.id} className="sakhi-progress-card" style={{ cursor: "default" }}>
                  <div className="sakhi-progress-title">
                    <div className="sakhi-progress-title-left">
                      <span className="sakhi-progress-dot" data-state="todo" />
                      <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>{e.type}</span>
                    </div>
                    <span className="sakhi-caption">{formatTs(e.timestamp)}</span>
                  </div>
                  <div className="sakhi-progress-snippet">{e.message}</div>
                </div>
              ))}
            </div>
          )}

          <div className="sakhi-row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: "var(--space-4)" }}>
            <div className="sakhi-body" style={{ fontWeight: 950 }}>Recent operations</div>
            <div className="sakhi-caption">{events.length} events</div>
          </div>
          <div className="sakhi-progress-rail" style={{ marginTop: "var(--space-3)" }}>
            {events.slice(0, 16).map((e) => (
              <div key={e.id} className="sakhi-progress-card" style={{ cursor: "default" }}>
                <div className="sakhi-progress-title">
                  <div className="sakhi-progress-title-left">
                    <span className="sakhi-progress-dot" data-state={e.level === "error" ? "todo" : e.level === "warn" ? "active" : "done"} />
                    <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>{e.type}</span>
                  </div>
                  <span className="sakhi-caption">{formatTs(e.timestamp)}</span>
                </div>
                <div className="sakhi-progress-snippet">{e.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
