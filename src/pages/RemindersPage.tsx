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
  Pencil,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { ReminderQueueEntry, ReminderStatus } from "../services/db";
import { listRemindersByStatus, approveReminder, rejectReminder, cancelReminder, updateReminderMessage } from "../services/reminderQueueService";
import { sendReminder, resendReminder } from "../services/reminderDeliveryService";
import { getReminderAnalytics, ReminderAnalytics } from "../services/reminderAnalyticsService";

// Small stagger between bulk WhatsApp opens -- mirrors AppointmentPage.tsx's
// existing bulk-reminder pattern (index * 2500ms) so popup blockers/WhatsApp
// itself never see a burst of near-simultaneous window.open() calls.
const BULK_STAGGER_MS = 1200;
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
    setSelectedIds(new Set());
    void load(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (r: ReminderQueueEntry) => {
    setEditingId(r.id);
    setEditDraft(r.message);
  };

  const handleSaveEdit = async (id: string) => {
    setSavingEditId(id);
    try {
      await updateReminderMessage(id, editDraft);
      setEditingId(null);
      await load(activeTab);
    } finally {
      setSavingEditId(null);
    }
  };

  // Bulk approve (pending tab) / bulk send (approved tab) -- both reuse the
  // exact same single-item functions the per-row buttons already call, just
  // looped with a stagger so WhatsApp's own send flow (sendReminder opens a
  // window per message) doesn't get hit with a burst of calls at once.
  const handleBulkAction = async (action: (id: string) => Promise<unknown>) => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i++) {
        if (i > 0) await delay(BULK_STAGGER_MS);
        await action(ids[i]);
      }
      setSelectedIds(new Set());
      await load(activeTab);
    } finally {
      setBulkBusy(false);
    }
  };

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

              {(activeTab === "pending" || activeTab === "approved") && reminders.length > 0 && (
                <div className="sakhi-row" style={{ gap: 10, marginTop: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    data-testid="reminders-select-all"
                    onClick={() => setSelectedIds(selectedIds.size === reminders.length ? new Set() : new Set(reminders.map((r) => r.id)))}
                    className="sakhi-caption"
                    style={{ background: "none", border: "none", padding: 0, color: "#0d7377", fontWeight: 800, cursor: "pointer" }}
                  >
                    {selectedIds.size === reminders.length ? "Deselect all" : "Select all"}
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      data-testid="reminders-bulk-action"
                      disabled={bulkBusy}
                      onClick={() =>
                        handleBulkAction(activeTab === "pending" ? (id) => approveReminder(id) : (id) => sendReminder(id))
                      }
                      className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                      style={{ minHeight: 36, width: "auto", padding: "0 14px" }}
                    >
                      {bulkBusy
                        ? "Working…"
                        : activeTab === "pending"
                        ? `Approve ${selectedIds.size} selected`
                        : `Send ${selectedIds.size} selected`}
                    </button>
                  )}
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
                          {(r.status === "pending" || r.status === "approved") && (
                            <input
                              type="checkbox"
                              data-testid={`reminder-select-${r.id}`}
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleSelected(r.id)}
                              aria-label={`Select reminder for ${r.patientName}`}
                              style={{ width: 16, height: 16, cursor: "pointer" }}
                            />
                          )}
                          <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>{r.patientName}</span>
                          <span className="sakhi-pill" data-tone="muted">{r.type.replace("_", " ")}</span>
                        </div>
                        <span className="sakhi-caption">{formatDateTime(r.updatedAt)}</span>
                      </div>

                      {editingId === r.id ? (
                        <div style={{ marginTop: 8 }}>
                          <textarea
                            data-testid={`reminder-edit-textarea-${r.id}`}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="sakhi-input"
                            style={{ width: "100%", minHeight: 80, fontSize: 13, resize: "vertical" }}
                          />
                          <div className="sakhi-row" style={{ gap: 8, marginTop: 6 }}>
                            <button
                              type="button"
                              disabled={savingEditId === r.id}
                              onClick={() => handleSaveEdit(r.id)}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 36, width: "auto", padding: "0 12px" }}
                            >
                              {savingEditId === r.id ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="sakhi-caption"
                              style={{ background: "none", border: "none", padding: "0 8px", color: "#64748b", fontWeight: 700, cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="sakhi-progress-snippet" style={{ whiteSpace: "pre-line" }}>{r.message}</div>
                      )}

                      <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                        {r.status === "pending" && editingId !== r.id && (
                          <>
                            <button
                              type="button"
                              data-testid={`reminder-edit-${r.id}`}
                              disabled={busyId === r.id}
                              onClick={() => startEdit(r)}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Pencil size={14} /> Edit
                            </button>
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
