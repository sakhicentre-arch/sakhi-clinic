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
  Megaphone,
  CalendarClock,
  CalendarDays,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import FilteredPatientList, { FilteredListEntry } from "../components/FilteredPatientList";
import { usePatientStore } from "../store/usePatientStore";
import { ReminderQueueEntry, ReminderStatus } from "../services/db";
import { listRemindersByStatus, listAllReminders, approveReminder, rejectReminder, cancelReminder, updateReminderMessage, enqueueReminder } from "../services/reminderQueueService";
import { sendReminder, resendReminder } from "../services/reminderDeliveryService";
import { getReminderAnalytics, ReminderAnalytics } from "../services/reminderAnalyticsService";
import {
  getTodayAppointmentReminderCandidates,
  getThisWeekAppointmentReminderGroups,
  queueAppointmentReminders,
  AppointmentReminderCandidate,
  AppointmentReminderDayGroup,
} from "../services/reminderSchedulerService";

// WhatsApp Productivity: Bulk Messaging -- the doctor writes the message
// once; this only adds the same clinic-name branding prefix every other
// WhatsApp send in the app already uses (buildFollowUpMessage,
// buildPaymentReminderMessage), so a broadcast doesn't look different from
// any other message the clinic sends.
function buildBulkMessage(body: string): string {
  return `*Sakhi Homeopathic Clinic*\n${body}`;
}

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

  // WhatsApp Productivity: Bulk Messaging -- two-step compose flow (pick
  // recipients, then write one message for all of them), landing in the
  // exact same pending queue as every other reminder so it goes through
  // the normal preview/edit/approve/send review, not a direct send.
  const [composeStep, setComposeStep] = useState<"closed" | "select" | "message">("closed");
  const [composeRecipients, setComposeRecipients] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [composeMessage, setComposeMessage] = useState("");
  const [composeQueuing, setComposeQueuing] = useState(false);
  const [composeError, setComposeError] = useState("");
  const allPatients = usePatientStore((s) => s.patients);

  // Appointment reminders (Today / This Week) -- doctor-initiated queueing,
  // see reminderSchedulerService.ts. Read-only candidate lists plus a
  // sourceRef -> ReminderQueueEntry lookup so each row can show its real
  // queue status (Pending/Approved/Sent/Failed) once queued, or "No
  // WhatsApp" if the patient has no phone on file, or nothing extra if it
  // simply hasn't been queued yet.
  const [todayCandidates, setTodayCandidates] = useState<AppointmentReminderCandidate[]>([]);
  const [weekGroups, setWeekGroups] = useState<AppointmentReminderDayGroup[]>([]);
  const [appointmentReminderBySourceRef, setAppointmentReminderBySourceRef] = useState<Map<string, ReminderQueueEntry>>(new Map());
  const [queueingToday, setQueueingToday] = useState(false);
  const [queueingWeek, setQueueingWeek] = useState(false);
  const [queueingDay, setQueueingDay] = useState<string | null>(null);
  const [appointmentNote, setAppointmentNote] = useState("");

  const loadAppointmentReminders = async () => {
    const [today, week, allReminders] = await Promise.all([
      getTodayAppointmentReminderCandidates(),
      getThisWeekAppointmentReminderGroups(),
      listAllReminders(),
    ]);
    setTodayCandidates(today);
    setWeekGroups(week);
    const bySourceRef = new Map<string, ReminderQueueEntry>();
    for (const r of allReminders) {
      if (r.sourceRef?.startsWith("appointment:")) bySourceRef.set(r.sourceRef, r);
    }
    setAppointmentReminderBySourceRef(bySourceRef);
  };

  useEffect(() => {
    void loadAppointmentReminders();
  }, []);

  const summarizeQueueResult = (result: { queued: unknown[]; skippedDuplicate: number; skippedNoPhone: number }) => {
    const parts: string[] = [];
    if (result.queued.length) parts.push(`${result.queued.length} queued for review`);
    if (result.skippedDuplicate) parts.push(`${result.skippedDuplicate} already have an active reminder`);
    if (result.skippedNoPhone) parts.push(`${result.skippedNoPhone} have no WhatsApp number on file`);
    return parts.join(" · ") || "Nothing to queue.";
  };

  const afterQueueing = async (queuedCount: number) => {
    await loadAppointmentReminders();
    if (queuedCount > 0) {
      setActiveTab("pending");
      await load("pending");
    }
  };

  const handleQueueToday = async () => {
    setQueueingToday(true);
    setAppointmentNote("");
    try {
      const result = await queueAppointmentReminders(todayCandidates);
      setAppointmentNote(summarizeQueueResult(result));
      await afterQueueing(result.queued.length);
    } finally {
      setQueueingToday(false);
    }
  };

  const handleQueueWeek = async () => {
    setQueueingWeek(true);
    setAppointmentNote("");
    try {
      const all = weekGroups.flatMap((g) => g.candidates);
      const result = await queueAppointmentReminders(all);
      setAppointmentNote(summarizeQueueResult(result));
      await afterQueueing(result.queued.length);
    } finally {
      setQueueingWeek(false);
    }
  };

  const handleQueueDay = async (group: AppointmentReminderDayGroup) => {
    setQueueingDay(group.date);
    setAppointmentNote("");
    try {
      const result = await queueAppointmentReminders(group.candidates);
      setAppointmentNote(summarizeQueueResult(result));
      await afterQueueing(result.queued.length);
    } finally {
      setQueueingDay(null);
    }
  };

  type StatusBadge = { label: string; tone: "success" | "muted" | "brand"; style?: React.CSSProperties };

  const appointmentReminderBadge = (candidate: AppointmentReminderCandidate): StatusBadge => {
    if (!candidate.phone) {
      return { label: "No WhatsApp", tone: "muted", style: { background: "rgba(220,38,38,0.10)", color: "#b91c1c", borderColor: "rgba(220,38,38,0.18)" } };
    }
    const reminder = appointmentReminderBySourceRef.get(`appointment:${candidate.appointmentId}`);
    if (!reminder) return { label: "Not queued", tone: "muted" };
    switch (reminder.status) {
      case "sent": return { label: "✓ Sent", tone: "success" };
      case "failed": return { label: "⚠ Failed", tone: "muted", style: { background: "rgba(220,38,38,0.10)", color: "#b91c1c", borderColor: "rgba(220,38,38,0.18)" } };
      case "approved": return { label: "Approved", tone: "brand" };
      case "pending": return { label: "○ Pending", tone: "muted" };
      case "rejected": return { label: "Rejected", tone: "muted" };
      case "cancelled": return { label: "Cancelled", tone: "muted" };
      default: return { label: reminder.status, tone: "muted" };
    }
  };

  // Doctor-reported gap: the main Queue list showed only "last updated"
  // (formatDateTime(r.updatedAt)), so the doctor couldn't see WHEN an
  // appointment reminder is actually due without reading the full message
  // body. ReminderQueueEntry's own `dueAt` field isn't useful for this --
  // both producers set it to "now" (it means "when to review/send", not
  // the appointment's date/time, per db.ts's own field comment). The real
  // date/time already lives in todayCandidates/weekGroups (loaded for the
  // sections above), so it's cross-referenced here by sourceRef instead of
  // adding a new field. Follow-up reminders aren't covered by this lookup
  // (their buckets aren't loaded on this page) -- their due date remains
  // visible only in the message body, same as before.
  const appointmentDueBySourceRef = useMemo(() => {
    const map = new Map<string, string>();
    todayCandidates.forEach((c) => map.set(`appointment:${c.appointmentId}`, `Today ${c.time}`));
    weekGroups.forEach((g) => g.candidates.forEach((c) => map.set(`appointment:${c.appointmentId}`, `${g.label} ${c.time}`)));
    return map;
  }, [todayCandidates, weekGroups]);

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
    if (!editDraft.trim()) return;
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
    setActionNote("");
    try {
      const ids = Array.from(selectedIds);
      let succeeded = 0;
      let firstError: unknown = null;
      for (let i = 0; i < ids.length; i++) {
        if (i > 0) await delay(BULK_STAGGER_MS);
        try {
          await action(ids[i]);
          succeeded++;
        } catch (err) {
          firstError = firstError ?? err;
        }
      }
      if (firstError) {
        setActionNote(
          `${succeeded} of ${ids.length} completed; ${ids.length - succeeded} failed. First error: ${firstError instanceof Error ? firstError.message : String(firstError)}`
        );
      }
      setSelectedIds(new Set());
      await Promise.all([load(activeTab), loadAppointmentReminders()]);
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
      // Approving/sending/rejecting/cancelling/resending a reminder can
      // change an appointment-reminder's status -- refresh the Today/This
      // Week sections' status badges too, not just this tab's own list,
      // or they'd show a stale "Pending" after the doctor already sent it.
      await Promise.all([load(activeTab), loadAppointmentReminders()]);
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

  const bulkComposeEntries: FilteredListEntry[] = (allPatients || []).map((p) => ({
    patientId: String(p.id),
    name: p.name || "Unknown Patient",
    phone: p.phone,
    subtitle: p.phone || "No phone on file",
  }));

  const handleComposeSelectRecipients = (patientIds: string[]) => {
    const byId = new Map((allPatients || []).map((p) => [String(p.id), p]));
    const recipients = patientIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ id: String(p.id), name: p.name || "Unknown Patient", phone: p.phone }));
    setComposeRecipients(recipients);
    setComposeStep("message");
  };

  const handleQueueBulkMessage = async () => {
    if (!composeMessage.trim() || composeRecipients.length === 0) return;
    setComposeQueuing(true);
    setComposeError("");
    try {
      const sourceRef = `bulk:${Date.now()}`;
      let succeeded = 0;
      let firstError: unknown = null;
      for (const recipient of composeRecipients) {
        try {
          await enqueueReminder({
            patientId: recipient.id,
            patientName: recipient.name,
            phone: recipient.phone,
            type: "custom",
            message: buildBulkMessage(composeMessage.trim()),
            dueAt: new Date().toISOString(),
            sourceRef,
          });
          succeeded++;
        } catch (err) {
          firstError = firstError ?? err;
        }
      }
      if (firstError) {
        setComposeError(
          `Queued ${succeeded} of ${composeRecipients.length}. First error: ${firstError instanceof Error ? firstError.message : String(firstError)}`
        );
        return;
      }
      setComposeStep("closed");
      setComposeRecipients([]);
      setComposeMessage("");
      setActiveTab("pending");
      await load("pending");
    } finally {
      setComposeQueuing(false);
    }
  };

  if (composeStep === "select") {
    return (
      <FilteredPatientList
        title="Bulk Message — Select Recipients"
        subtitle="Choose who should receive this message."
        entries={bulkComposeEntries}
        onSelectPatient={() => {}}
        onBack={() => setComposeStep("closed")}
        selectable
        onSendReminders={handleComposeSelectRecipients}
        actionLabel="Continue"
        searchable
      />
    );
  }

  if (composeStep === "message") {
    return (
      <div className="sakhi-page" data-testid="bulk-message-compose">
        <div className="sakhi-stack">
          <header>
            <button
              type="button"
              onClick={() => setComposeStep("select")}
              className="sakhi-caption"
              style={{ background: "none", border: "none", padding: 0, marginBottom: 8, color: "#0d7377", fontWeight: 800, cursor: "pointer" }}
            >
              ← Back to recipients
            </button>
            <div className="sakhi-title">Bulk Message — Write Message</div>
            <div className="sakhi-caption" style={{ marginTop: 4 }}>
              {composeRecipients.length} recipient{composeRecipients.length === 1 ? "" : "s"} selected
            </div>
          </header>
          <ResponsiveContainer>
            <MobileSection>
              <MobileCard>
                <textarea
                  data-testid="bulk-message-textarea"
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  placeholder="Write the message every selected patient will receive…"
                  className="sakhi-input"
                  style={{ width: "100%", minHeight: 120, fontSize: 13, resize: "vertical" }}
                />
                <div className="sakhi-caption" style={{ marginTop: 8 }}>
                  Each message is queued individually for your review -- nothing sends until you approve it in the Pending tab, same as any other reminder.
                </div>
                {composeError && (
                  <div className="sakhi-caption" data-testid="bulk-message-error" style={{ marginTop: 8, color: "#b91c1c", fontWeight: 800 }}>
                    {composeError}
                  </div>
                )}
                <button
                  type="button"
                  data-testid="bulk-message-queue"
                  disabled={composeQueuing || !composeMessage.trim()}
                  onClick={handleQueueBulkMessage}
                  className="sakhi-btn-primary sakhi-tap sakhi-focus-ring"
                  style={{ marginTop: "var(--space-3)", minHeight: 48 }}
                >
                  {composeQueuing ? "Adding to queue…" : `Add to Queue (${composeRecipients.length})`}
                </button>
              </MobileCard>
            </MobileSection>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

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

            {/* ================= Today's Appointment Reminders ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)", justifyContent: "space-between" }}>
                <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                  <CalendarClock size={18} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>Today's Appointment Reminders</div>
                </div>
                <span className="sakhi-pill" data-tone={todayCandidates.length > 0 ? "brand" : "muted"}>{todayCandidates.length}</span>
              </div>

              {todayCandidates.length === 0 ? (
                <div className="sakhi-caption">No appointments today.</div>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="queue-today-reminders"
                    disabled={queueingToday}
                    onClick={handleQueueToday}
                    className="sakhi-btn-primary sakhi-tap sakhi-focus-ring"
                    style={{ minHeight: 44, width: "100%", marginBottom: "var(--space-2)" }}
                  >
                    {queueingToday ? "Queuing…" : `Queue Today's Reminders (${todayCandidates.length})`}
                  </button>
                  {appointmentNote && (
                    <div className="sakhi-caption" style={{ marginBottom: "var(--space-2)", color: "#475569", fontWeight: 800 }}>{appointmentNote}</div>
                  )}
                  <div className="sakhi-progress-rail">
                    {todayCandidates.map((c) => {
                      const badge = appointmentReminderBadge(c);
                      return (
                        <div key={c.appointmentId} className="sakhi-progress-card" data-testid={`today-reminder-row-${c.appointmentId}`}>
                          <div className="sakhi-progress-title">
                            <div className="sakhi-progress-title-left">
                              <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>{c.patientName}</span>
                              <span className="sakhi-caption">{c.time} · {c.clinic}</span>
                            </div>
                            <span className="sakhi-pill" data-tone={badge.tone} style={badge.style} data-testid={`today-reminder-status-${c.appointmentId}`}>
                              {badge.label}
                            </span>
                          </div>
                          {!c.phone && (
                            <div className="sakhi-caption" style={{ color: "#b91c1c", marginTop: 4 }} data-testid={`today-reminder-no-phone-${c.appointmentId}`}>
                              No phone number on file for {c.patientName} — add one in Patients to enable this reminder.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </MobileCard>

            {/* ================= This Week's Appointment Reminders ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)", justifyContent: "space-between" }}>
                <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                  <CalendarDays size={18} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>This Week's Appointment Reminders</div>
                </div>
                <span className="sakhi-pill" data-tone="muted">{weekGroups.reduce((n, g) => n + g.candidates.length, 0)}</span>
              </div>

              {weekGroups.every((g) => g.candidates.length === 0) ? (
                <div className="sakhi-caption">No appointments in the next 7 days.</div>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="queue-week-reminders"
                    disabled={queueingWeek}
                    onClick={handleQueueWeek}
                    className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
                    style={{ minHeight: 44, width: "100%", marginBottom: "var(--space-3)" }}
                  >
                    {queueingWeek ? "Queuing…" : "Queue All of This Week's Reminders"}
                  </button>
                  <div className="sakhi-stack-tight">
                    {weekGroups.filter((g) => g.candidates.length > 0).map((g) => (
                      <div key={g.date} style={{ marginBottom: "var(--space-3)" }}>
                        <div className="sakhi-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                          <span className="sakhi-caption" style={{ fontWeight: 900, color: "#0f172a" }}>
                            {g.label} — {g.candidates.length} patient{g.candidates.length === 1 ? "" : "s"}
                          </span>
                          <button
                            type="button"
                            data-testid={`queue-day-${g.date}`}
                            disabled={queueingDay === g.date}
                            onClick={() => handleQueueDay(g)}
                            className="sakhi-caption"
                            style={{ background: "none", border: "none", padding: 0, color: "#0d7377", fontWeight: 800, cursor: "pointer" }}
                          >
                            {queueingDay === g.date ? "Queuing…" : "Queue this day"}
                          </button>
                        </div>
                        <div className="sakhi-progress-rail">
                          {g.candidates.map((c) => {
                            const badge = appointmentReminderBadge(c);
                            return (
                              <div key={c.appointmentId} className="sakhi-progress-card" data-testid={`week-reminder-row-${c.appointmentId}`}>
                                <div className="sakhi-progress-title">
                                  <div className="sakhi-progress-title-left">
                                    <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>{c.patientName}</span>
                                    <span className="sakhi-caption">{c.time} · {c.clinic}</span>
                                  </div>
                                  <span className="sakhi-pill" data-tone={badge.tone} style={badge.style} data-testid={`week-reminder-status-${c.appointmentId}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                {!c.phone && (
                                  <div className="sakhi-caption" style={{ color: "#b91c1c", marginTop: 4 }} data-testid={`week-reminder-no-phone-${c.appointmentId}`}>
                                    No phone number on file for {c.patientName} — add one in Patients to enable this reminder.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </MobileCard>

            {/* ================= Queue ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)", justifyContent: "space-between" }}>
                <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                  <MessageCircle size={18} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>Reminder queue</div>
                </div>
                <button
                  type="button"
                  data-testid="bulk-message-start"
                  onClick={() => setComposeStep("select")}
                  className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                  style={{ minHeight: 36, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Megaphone size={14} />
                  New Bulk Message
                </button>
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
                    <div key={r.id} className="sakhi-progress-card" data-testid={`reminder-queue-row-${r.id}`}>
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
                        <span className="sakhi-caption" data-testid={`reminder-queue-when-${r.id}`}>
                          {r.sourceRef && appointmentDueBySourceRef.get(r.sourceRef)
                            ? `Due ${appointmentDueBySourceRef.get(r.sourceRef)} · updated ${formatDateTime(r.updatedAt)}`
                            : formatDateTime(r.updatedAt)}
                        </span>
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
                              disabled={savingEditId === r.id || !editDraft.trim()}
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
                              style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => approveReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => rejectReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
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
                              style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <Send size={14} /> Send via WhatsApp
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => runAction(r.id, () => cancelReminder(r.id))}
                              className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                              style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
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
                            style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
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
                            style={{ minHeight: 44, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
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
