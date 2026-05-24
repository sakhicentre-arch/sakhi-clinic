import { useEffect, useMemo, useState } from "react";
import { getMaintenanceRuntimeReport } from "../../services/maintenanceRuntimeService";
import { getRecentOperationalEvents, pruneOperationalEvents } from "../../services/operationalEventLogService";
import type { OperationalEvent } from "../../services/db";

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

  const errorEvents = useMemo(
    () => events.filter((e) => e.level === "error" || String(e.type).includes(".failure") || String(e.type).includes("unhandled")),
    [events]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [recent, rep] = await Promise.all([getRecentOperationalEvents(60), getMaintenanceRuntimeReport({ includeRecentEvents: 25 })]);
      setEvents(recent);
      setReport(rep);
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
          </div>
        )}

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

