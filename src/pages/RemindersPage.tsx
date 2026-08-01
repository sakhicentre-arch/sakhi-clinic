/**
 * RemindersPage.tsx
 * Sakhi Clinic — WhatsApp Reminder Intelligence (Phase 2).
 *
 * UI-only: every action here calls into reminderQueueService.ts or
 * reminderDeliveryService.ts. No queue/delivery logic lives in this file.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  Check,
  X,
  Send,
  RotateCcw,
  Ban,
  History as HistoryIcon,
  TrendingUp,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { ReminderQueueEntry, ReminderStatus } from "../services/db";
import { listRemindersByStatus, approveReminder, rejectReminder, cancelReminder } from "../services/reminderQueueService";
import { sendReminder, resendReminder } from "../services/reminderDeliveryService";
import { getReminderAnalytics, ReminderAnalytics } from "../services/reminderAnalyticsService";

const TAB_ORDER: ReminderStatus[] = ["pending", "approved", "sent", "failed", "cancelled", "rejected"];
const TAB_LABELS: Record<ReminderStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function RemindersPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReminderStatus>("pending");
  const [reminders, setReminders] = useState<ReminderQueueEntry[]>([]);
  const [countsByTab, setCountsByTab] = useState<Record<ReminderStatus, number>>({
    pending: 0, approved: 0, sent: 0, failed: 0, cancelled: 0, rejected: 0,
  });
  const [analytics, setAnalytics] = useState<ReminderAnalytics | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string>("");

  const load = async (tab: ReminderStatus = activeTab) => {
    setLoading(true);
    try {
      const [list, a, ...allCounts] = await Promise.all([
        listRemindersByStatus(tab),
        getReminderAnalytics(),
        ...TAB_ORDER.map((s) => listRemindersByStatus(s)),
      ]);
      setReminders(list);
      setAnalytics(a);
      const counts = {} as Record<ReminderStatus, number>;
      TAB_ORDER.forEach((s, i) => { counts[s] = allCounts[i].length; });
      setCountsByTab(counts);
    } catch (err) {
      console.error("[RemindersPage] Failed to load reminders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const runAction = async (id: string, action: () => Promise<unknown>, note?: string) => {
    setBusyId(id);
    setActionNote("");
    try {
      const result: any = await action();
      if (result && result.ok === false) {
        setActionNote(result.reason || "Action failed");
      } else if (note) {
        setActionNote(note);
      }
      await load(activeTab);
    } catch (err) {
      setActionNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const successRateColor = useMemo(() => {
    if (!analytics) return undefined;
    if (analytics.deliverySuccessRate >= 80) return "#16a34a";
    if (analytics.deliverySuccessRate >= 50) return "#d97706";
    return "#dc2626";
  }, [analytics]);

  return (
    <div className="sakhi-page" data-testid="reminders-page">
      <div className="sakhi-stack">
        <header>
          <div className="sakhi-title">Reminders</div>
          <div className="sakhi-caption" style={{ marginTop: 4 }}>
            WhatsApp reminder intelligence
          </div>
        </header>

        <ResponsiveContainer>
          <MobileSection>
            {/* ================= Analytics ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                <TrendingUp size={18} />
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Analytics</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-2)" }}>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value">{analytics?.countsByStatus.pending ?? 0}</div>
                  <div className="sakhi-metric-label">Pending approval</div>
                </div>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value">{analytics?.sentCount ?? 0}</div>
                  <div className="sakhi-metric-label">Sent</div>
                </div>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value" style={{ color: (analytics?.failedCount || 0) > 0 ? "#dc2626" : undefined }}>
                    {analytics?.failedCount ?? 0}
                  </div>
                  <div className="sakhi-metric-label">Failed</div>
                </div>
                <div className="sakhi-metric">
                  <div className="sakhi-metric-value" style={{ color: successRateColor }}>
                    {analytics?.deliverySuccessRate ?? 0}%
                  </div>
                  <div className="sakhi-metric-label">Send success rate</div>
                </div>
              </div>

              {analytics && analytics.stalePendingCount > 0 && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-3)", color: "#b45309", fontWeight: 800 }}>
                  {analytics.stalePendingCount} reminder{analytics.stalePendingCount === 1 ? "" : "s"} pending review for 3+ days
                </div>
              )}

              <div className="sakhi-caption" style={{ marginTop: "var(--space-2)" }}>
                "Sent" means the doctor approved it and WhatsApp opened with the message ready — there is no delivery or read receipt without a WhatsApp Business API integration.
              </div>
            </MobileCard>

            {/* ================= Queue ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                <MessageCircle size={18} />
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Reminder queue</div>
              </div>

              <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {TAB_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                    data-selected={String(activeTab === status)}
                    data-tone="brand"
                    onClick={() => setActiveTab(status)}
                  >
                    {TAB_LABELS[status]} ({countsByTab[status]})
                  </button>
                ))}
              </div>

              {actionNote && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#475569", fontWeight: 800 }}>
                  {actionNote}
                </div>
              )}

              <div className="sakhi-progress-rail" style={{ marginTop: "var(--space-3)" }}>
                {loading ? (
                  <div className="sakhi-caption">Loading…</div>
                ) : reminders.length === 0 ? (
                  <div className="sakhi-caption">No reminders in this queue.</div>
                ) : (
                  reminders.map((r) => (
                    <div key={r.id} className="sakhi-progress-card">
                      <div className="sakhi-progress-title">
                        <div className="sakhi-progress-title-left">
                          <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>{r.patientName}</span>
                          <span className="sakhi-pill" data-tone="muted">{r.type.replace("_", " ")}</span>
                        </div>
                        <span className="sakhi-caption">{formatDateTime(r.updatedAt)}</span>
                      </div>
                      <div className="sakhi-progress-snippet" style={{ whiteSpace: "pre-line" }}>{r.message}</div>

                      <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                        {r.status === "pending" && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => approveReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => rejectReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <X size={14} /> Reject
                            </button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => sendReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Send size={14} /> Send via WhatsApp
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => cancelReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Ban size={14} /> Cancel
                            </button>
                          </>
                        )}
                        {r.status === "failed" && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => runAction(r.id, () => resendReminder(r.id))}
                            className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                            style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <RotateCcw size={14} /> Resend
                          </button>
                        )}
                        {r.status === "sent" && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => runAction(r.id, () => resendReminder(r.id))}
                            className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                            style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <RotateCcw size={14} /> Resend
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </MobileCard>

            {/* ================= Delivery history / audit log ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                <HistoryIcon size={18} />
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Delivery history</div>
              </div>

              {!analytics || analytics.recentHistory.length === 0 ? (
                <div className="sakhi-caption">No reminder activity recorded yet.</div>
              ) : (
                <div className="sakhi-progress-rail">
                  {analytics.recentHistory.map((h) => (
                    <div key={h.id} className="sakhi-progress-card">
                      <div className="sakhi-progress-title">
                        <div className="sakhi-progress-title-left">
                          <span className="sakhi-progress-dot" data-state={h.action === "sent" ? "done" : h.action === "failed" ? "todo" : "active"} />
                          <span className="sakhi-body" style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>{h.patientName}</span>
                        </div>
                        <span className="sakhi-caption">{formatDateTime(h.attemptedAt)}</span>
                      </div>
                      <div className="sakhi-progress-snippet">
                        {h.action}{h.note ? ` — ${h.note}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
