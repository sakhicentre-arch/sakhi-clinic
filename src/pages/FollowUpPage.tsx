/**
 * FollowUpPage.tsx
 * Sakhi Clinic — Follow-up Intelligence Dashboard (Phase 1).
 *
 * Pure read/aggregation layer over existing patient + consultation data via
 * followUpIntelligenceService.ts. No new persisted state is introduced here.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  History as HistoryIcon,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { ActivePage } from "../store/uiStore";
import { useUIStore } from "../store/uiStore";
import {
  getFollowUpBuckets,
  getFollowUpAnalytics,
  getIntelligentAlerts,
  getFollowUpHistory,
  FollowUpBuckets,
  FollowUpBucketKey,
  FollowUpAnalytics,
  IntelligentAlert,
  FollowUpHistoryEntry,
} from "../services/followUpIntelligenceService";
import { cancelFollowUp } from "../services/patientService";

interface Props {
  onNavigate?: (page: ActivePage) => void;
}

// "completed" isn't a real-time bucket (followUpIntelligenceService.ts's
// FollowUpBucketKey) -- it's derived history (getFollowUpHistory()), shown
// as a filter tab alongside the buckets per RC1's status list (Upcoming/Due
// Today/Overdue/Completed/Cancelled) without inventing a second bucket shape.
type FollowUpTab = FollowUpBucketKey | "completed";

// Buckets a doctor can still act on -- these are the only ones "Cancel
// follow-up" makes sense for. Cancelling from noDate/cancelled/completed
// doesn't mean anything (nothing active to cancel).
const CANCELLABLE_BUCKETS = new Set<FollowUpTab>(["overdue", "today", "tomorrow", "upcoming7"]);

const BUCKET_LABELS: Record<FollowUpTab, string> = {
  overdue: "Overdue",
  today: "Due Today",
  tomorrow: "Tomorrow",
  upcoming7: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
  noDate: "No Follow-up Set",
};

const TAB_ORDER: FollowUpTab[] = ["overdue", "today", "tomorrow", "upcoming7", "completed", "cancelled", "noDate"];

function severityTone(severity: number): "success" | "muted" | "brand" {
  if (severity >= 3) return "brand";
  if (severity >= 2) return "muted";
  return "muted";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

export default function FollowUpPage({ onNavigate }: Props) {
  const setActivePatientId = useUIStore((s) => s.setActivePatientId);

  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<FollowUpBuckets | null>(null);
  const [analytics, setAnalytics] = useState<FollowUpAnalytics | null>(null);
  const [alerts, setAlerts] = useState<IntelligentAlert[]>([]);
  const [history, setHistory] = useState<FollowUpHistoryEntry[]>([]);
  const [activeBucket, setActiveBucket] = useState<FollowUpTab>("overdue");
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, a, al, h] = await Promise.all([
        getFollowUpBuckets(),
        getFollowUpAnalytics(),
        getIntelligentAlerts(),
        getFollowUpHistory(),
      ]);
      setBuckets(b);
      setAnalytics(a);
      setAlerts(al);
      setHistory(h);
    } catch (err) {
      console.error("[FollowUpPage] Failed to load follow-up intelligence:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const goToPatient = (patientId: string) => {
    setActivePatientId(patientId);
    onNavigate?.("patients");
  };

  const handleCancelFollowUp = async (patientId: string) => {
    setCancellingId(patientId);
    try {
      await cancelFollowUp(patientId);
      await load();
      // The row just vanished from whatever bucket the doctor was looking
      // at -- switch to Cancelled so that reads as confirmation, not as
      // the patient silently disappearing.
      setActiveBucket("cancelled");
    } finally {
      setCancellingId(null);
    }
  };

  const maxWorkload = useMemo(
    () => Math.max(1, ...(analytics?.dailyWorkload.map((d) => d.count) || [1])),
    [analytics]
  );
  const maxTrend = useMemo(() => {
    const values = (analytics?.weeklyTrend || []).flatMap((w) => [w.completed, w.missed]);
    return Math.max(1, ...values);
  }, [analytics]);

  // "Completed" reuses the same row shape as the real-time buckets so the
  // list below doesn't need a second render branch -- it's built from
  // getFollowUpHistory()'s already-fetched data, deduplicated to one row
  // per patient (most recent completion), matching the other tabs' "which
  // patients" framing.
  const completedEntries = useMemo(() => {
    const byPatient = new Map<string, FollowUpHistoryEntry>();
    for (const h of history) {
      if (h.status !== "completed") continue;
      const existing = byPatient.get(h.patientId);
      if (!existing || h.followUpDate > existing.followUpDate) byPatient.set(h.patientId, h);
    }
    return Array.from(byPatient.values()).map((h) => ({
      patientId: h.patientId,
      patientName: h.patientName,
      nextFollowUpDate: h.followUpDate,
      isChronic: false,
    }));
  }, [history]);

  const activeBucketEntries = activeBucket === "completed" ? completedEntries : buckets ? buckets[activeBucket] : [];

  return (
    <div className="sakhi-page" data-testid="followups-page">
      <div className="sakhi-stack">
        <header>
          <div className="sakhi-title">Follow-ups</div>
          <div className="sakhi-caption" style={{ marginTop: 4 }}>
            Intelligence dashboard
          </div>
        </header>

        <ResponsiveContainer>
          <MobileSection>
            {/* ================= Analytics summary ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                <TrendingUp size={18} />
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Analytics</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-2)" }}>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value">{loading ? "…" : analytics?.pendingCount ?? 0}</div>
                  <div className="sakhi-metric-label">Pending</div>
                </div>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value" style={{ color: (analytics?.overdueCount || 0) > 0 ? "#dc2626" : undefined }}>
                    {loading ? "…" : analytics?.overdueCount ?? 0}
                  </div>
                  <div className="sakhi-metric-label">Overdue</div>
                </div>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value">{loading ? "…" : `${analytics?.completionRate ?? 0}%`}</div>
                  <div className="sakhi-metric-label">Completion rate</div>
                </div>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value">
                    {loading ? "…" : `${analytics?.completedCount ?? 0} / ${analytics?.missedCount ?? 0}`}
                  </div>
                  <div className="sakhi-metric-label">Completed / Missed</div>
                </div>
              </div>

              <div className="sakhi-caption" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                Daily workload — next 7 days
              </div>
              <div className="sakhi-row" style={{ gap: 6, alignItems: "flex-end", height: 64 }}>
                {(analytics?.dailyWorkload || []).map((d) => (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 28,
                        height: Math.max(4, (d.count / maxWorkload) * 44),
                        background: d.count > 0 ? "var(--brand, #0D7377)" : "rgba(226,232,240,0.9)",
                        borderRadius: 4,
                      }}
                      title={`${d.label}: ${d.count}`}
                    />
                    <span className="sakhi-caption" style={{ fontSize: 10 }}>{d.label}</span>
                  </div>
                ))}
              </div>

              {analytics && analytics.weeklyTrend.length > 0 && (
                <>
                  <div className="sakhi-caption" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                    Weekly trend (completed vs missed)
                  </div>
                  <div className="sakhi-stack-tight">
                    {analytics.weeklyTrend.map((w) => (
                      <div key={w.weekStart} className="sakhi-row" style={{ gap: 6 }}>
                        <span className="sakhi-caption" style={{ width: 60, flexShrink: 0, fontSize: 10 }}>
                          {formatDate(w.weekStart)}
                        </span>
                        <div style={{ flex: 1, display: "flex", gap: 2, height: 8 }}>
                          <div style={{ width: `${(w.completed / maxTrend) * 100}%`, background: "#16a34a", borderRadius: 4 }} />
                          <div style={{ width: `${(w.missed / maxTrend) * 100}%`, background: "#dc2626", borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </MobileCard>

            {/* ================= Intelligent alerts ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)", justifyContent: "space-between" }}>
                <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                  <AlertTriangle size={18} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>Intelligent Alerts</div>
                </div>
                <span className="sakhi-pill" data-tone={alerts.length > 0 ? "brand" : "muted"}>{alerts.length}</span>
              </div>

              {loading ? (
                <div className="sakhi-caption">Loading…</div>
              ) : alerts.length === 0 ? (
                <div className="sakhi-caption">No alerts — everything is on track.</div>
              ) : (
                <div className="sakhi-progress-rail">
                  {alerts.map((a, i) => (
                    <button
                      key={`${a.patientId}-${a.type}-${i}`}
                      type="button"
                      className="sakhi-progress-card sakhi-tap sakhi-focus-ring"
                      style={{ textAlign: "left", width: "100%", border: "1px solid rgba(226,232,240,0.95)", cursor: "pointer" }}
                      onClick={() => goToPatient(a.patientId)}
                    >
                      <div className="sakhi-progress-title">
                        <div className="sakhi-progress-title-left">
                          <span className="sakhi-progress-dot" data-state={a.severity >= 3 ? "todo" : "active"} />
                          <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>{a.patientName}</span>
                        </div>
                        <span className="sakhi-pill" data-tone={severityTone(a.severity)}>{a.type.replace(/_/g, " ")}</span>
                      </div>
                      <div className="sakhi-progress-snippet">{a.message}</div>
                    </button>
                  ))}
                </div>
              )}
            </MobileCard>

            {/* ================= Bucketed follow-up lists ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                <CalendarClock size={18} />
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Follow-up queue</div>
              </div>

              <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {TAB_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                    data-selected={String(activeBucket === key)}
                    data-tone="brand"
                    onClick={() => setActiveBucket(key)}
                  >
                    {BUCKET_LABELS[key]} ({key === "completed" ? completedEntries.length : buckets ? buckets[key].length : 0})
                  </button>
                ))}
              </div>

              <div className="sakhi-progress-rail" style={{ marginTop: "var(--space-3)" }}>
                {loading ? (
                  <div className="sakhi-caption">Loading…</div>
                ) : activeBucketEntries.length === 0 ? (
                  <div className="sakhi-caption">No patients in this bucket.</div>
                ) : (
                  activeBucketEntries.map((entry) => {
                    const isExpanded = expandedPatientId === entry.patientId;
                    const timeline = history.filter((h) => h.patientId === entry.patientId);
                    return (
                      <div key={entry.patientId} className="sakhi-progress-card">
                        <div className="sakhi-progress-title">
                          <div className="sakhi-progress-title-left">
                            <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>
                              {entry.patientName}
                            </span>
                            {entry.isChronic && <span className="sakhi-pill" data-tone="muted">Chronic</span>}
                          </div>
                          <div className="sakhi-row" style={{ gap: 6 }}>
                            {entry.nextFollowUpDate && (
                              <span className="sakhi-pill" data-tone={entry.daysOverdue ? "brand" : "muted"}>
                                {entry.daysOverdue ? `${entry.daysOverdue}d overdue` : formatDate(entry.nextFollowUpDate)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="sakhi-row" style={{ justifyContent: "space-between", marginTop: 4, flexWrap: "wrap", gap: 8 }}>
                          <div className="sakhi-row" style={{ gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => goToPatient(entry.patientId)}
                              className="sakhi-caption"
                              style={{ background: "none", border: "none", padding: 0, color: "var(--brand-ink, #0D7377)", fontWeight: 800, cursor: "pointer" }}
                            >
                              Open patient
                            </button>
                            {CANCELLABLE_BUCKETS.has(activeBucket) && (
                              <button
                                type="button"
                                disabled={cancellingId === entry.patientId}
                                onClick={() => handleCancelFollowUp(entry.patientId)}
                                className="sakhi-caption"
                                style={{ background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, color: "#b91c1c", fontWeight: 800, cursor: cancellingId === entry.patientId ? "default" : "pointer", opacity: cancellingId === entry.patientId ? 0.6 : 1 }}
                                aria-label={`Cancel follow-up for ${entry.patientName}`}
                              >
                                <XCircle size={12} />
                                {cancellingId === entry.patientId ? "Cancelling…" : "Cancel follow-up"}
                              </button>
                            )}
                          </div>
                          {timeline.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedPatientId(isExpanded ? null : entry.patientId)}
                              className="sakhi-caption"
                              style={{ background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#64748b", fontWeight: 800 }}
                              aria-expanded={isExpanded}
                              aria-label={`Toggle follow-up timeline for ${entry.patientName}`}
                            >
                              <HistoryIcon size={12} />
                              Timeline
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="sakhi-stack-tight" style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid rgba(226,232,240,0.95)" }}>
                            {timeline.map((h) => (
                              <div key={h.consultationId} className="sakhi-row" style={{ justifyContent: "space-between" }}>
                                <span className="sakhi-caption" style={{ fontSize: 11 }}>
                                  {formatDate(h.consultationDate)} → due {formatDate(h.followUpDate)}
                                </span>
                                <span
                                  className="sakhi-pill"
                                  data-tone={h.status === "completed" ? "success" : h.status === "missed" ? "brand" : "muted"}
                                >
                                  {h.status === "completed" && <CheckCircle2 size={10} />}
                                  {h.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
