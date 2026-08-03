/**
 * DashboardPage.tsx (PRO - V12.8 Hardened)
 * Sakhi Clinic — Advanced Clinical Practice Intelligence
 * Logic: Priority-Aware Analytics, Clinic-Scoped Risk Detection, KPI-Queue Alignment.
 * V12.9: Added onNavigate prop for state-based navigation to TrashPage
 */

import React, { useEffect, useState, useMemo } from "react";
import { 
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, 
  Tooltip, Legend, ArcElement, PointElement, LineElement 
} from 'chart.js';
import { Pie } from 'react-chartjs-2';

import { ConsultationOutcome, normalizeOutcome, Consultation } from "../services/db";
import { getAllConsultations } from "../services/consultationService";
import { getFollowUpAlerts, FollowUpAlert } from "../services/followupEngine";
import { isValidPhone } from "../utils/whatsapp";
import { openWhatsApp } from "../services/whatsappService";
import { exportBackup, importBackup } from "../services/backupService";
import { useUIStore } from "../store/uiStore";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { haptic } from "../utils/haptics";
import { useQueueStore } from "../store/queueStore";
import { PullToRefreshScrollRegion } from "../components/layout/LayoutPrimitives";
import { patientRepository } from "../repositories/patientRepository";
import { getPaymentSummary, getRecentPayments, RecentPaymentEntry } from "../services/paymentService";
import { getQuickAccessPatients, QuickAccessPatient } from "../services/patientService";
import { getDashboardActionData, DashboardActionData, DashboardPatientRef } from "../services/dashboardActionService";
import FilteredPatientList, { FilteredListEntry } from "../components/FilteredPatientList";
import { enqueueReminder, hasActiveReminder } from "../services/reminderQueueService";
import {
  getBackupHealthSummary,
  getStorageEstimate,
  getLastBackupAt,
  formatBytes,
  BackupHealthSummary,
  StorageEstimateSummary,
} from "../services/storageHealthService";
import { getRecentOperationalEvents } from "../services/operationalEventLogService";
import { OperationalEvent } from "../services/db";

// Module 1 -- the 7 patient-list action cards. Each key maps straight to a
// DashboardActionData field; "consultations" (completed/pending) are plain
// counters, not lists, so they aren't part of this drill-down set.
type ActionCardKey =
  | "todayFollowUps"
  | "overdueFollowUps"
  | "thisWeekFollowUps"
  | "upcomingFollowUps"
  | "missedPatients"
  | "newPatientsToday"
  | "repeatPatientsToday"
  | "pendingReminders"
  | "pendingPayments";

interface ActionCardConfig {
  key: ActionCardKey;
  label: string;
  icon: string;
  color: string;
  emptyMessage: string;
  /** "pendingReminders" already IS a filtered workflow (the Reminders
   * queue itself) -- clicking it jumps straight there instead of
   * detouring through another patient list first. */
  navigateTo?: string;
}

const ACTION_CARDS: ActionCardConfig[] = [
  { key: "todayFollowUps", label: "Today's Follow-ups", icon: "\u{1F4C5}", color: "#0d7377", emptyMessage: "No follow-ups due today." },
  { key: "overdueFollowUps", label: "Overdue Follow-ups", icon: "⚠️", color: "#dc2626", emptyMessage: "Nothing overdue right now." },
  { key: "thisWeekFollowUps", label: "This Week", icon: "\u{1F5D3}️", color: "#2563eb", emptyMessage: "No follow-ups due this week." },
  { key: "upcomingFollowUps", label: "Upcoming", icon: "⏭️", color: "#7c3aed", emptyMessage: "Nothing in the upcoming window." },
  { key: "missedPatients", label: "Missed Patients", icon: "\u{1F6AB}", color: "#b91c1c", emptyMessage: "No missed follow-ups." },
  { key: "newPatientsToday", label: "New Patients", icon: "\u{1F195}", color: "#16a34a", emptyMessage: "No new registrations today." },
  { key: "repeatPatientsToday", label: "Repeat Patients", icon: "\u{1F501}", color: "#d97706", emptyMessage: "No repeat visits today." },
  { key: "pendingReminders", label: "Pending Reminders", icon: "\u{1F4AC}", color: "#0891b2", emptyMessage: "No reminders awaiting approval.", navigateTo: "reminders" },
  { key: "pendingPayments", label: "Pending Payments", icon: "\u{1F4B0}", color: "#b45309", emptyMessage: "No pending payments." },
];

function buildGenericReminderMessage(patientName: string): string {
  return `*Sakhi Homeopathic Clinic*\nHi ${patientName}, this is a reminder from the clinic. Please contact us or visit at your earliest convenience.`;
}

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement
);

interface DashboardStats {
  totalPatients: number;
  totalConsultations: number;
  followUpsDue: number;
  patientsToday: number;
  todayPaid: number;
  todayPending: number;
  monthPaid: number;
  last7Days: Array<{ day: string; count: number }>;
  outcomeStats: Record<ConsultationOutcome | 'total', number>;
  remedyStats: Record<string, { used: number; improved: number }>;
  highRiskPatients: Array<{ id: string; name: string; reason: string }>;
  dataHealth: { incomplete: number; total: number; score: number };
}

// ✅ Step 2: Add Props interface with onNavigate
interface Props {
  onNavigate: (page: string) => void;
}

const DashboardPage: React.FC<Props> = ({ onNavigate }) => {
  const setActivePatientId = useUIStore((s) => s.setActivePatientId);
  const setActiveConsultation = useUIStore((s) => s.setActiveConsultation);
  const [isMobile, setIsMobile] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<FollowUpAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeClinic, setActiveClinic] = useState<string>("All");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const queue = useQueueStore((s) => s.queue);

  // Module 1 -- Doctor Action Dashboard: every card below is a doorway
  // into a workflow, not a statistic. actionData reuses
  // dashboardActionService.ts entirely -- no new data-access logic
  // lives in this component. activeCard drives a full drill-down
  // (FilteredPatientList takes over the page) rather than an inline
  // expansion, keeping this already-large component simpler.
  const [actionData, setActionData] = useState<DashboardActionData | null>(null);
  const [activeCardKey, setActiveCardKey] = useState<ActionCardKey | null>(null);

  // System-health widgets -- all reuse existing services (storageHealthService.ts,
  // operationalEventLogService.ts) already relied on by SettingsPage.tsx /
  // the backup subsystem itself; no new data-access logic here.
  const [backupHealth, setBackupHealth] = useState<BackupHealthSummary | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateSummary | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<OperationalEvent[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPaymentEntry[]>([]);
  const [quickAccessPatients, setQuickAccessPatients] = useState<QuickAccessPatient[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Auto-refresh: previously load-once-on-mount (plus manual pull-to-refresh
  // bumping refreshNonce). Mirrors the visibility-aware polling convention
  // already used by backupSchedulerService.ts/maintenanceRuntimeService.ts
  // -- refresh periodically while the tab is open, and immediately on
  // return from background, rather than a component-specific mechanism.
  // Reuses the exact existing refresh trigger (refreshNonce) instead of a
  // second fetch path.
  useEffect(() => {
    const REFRESH_INTERVAL_MS = 60_000;
    const interval = window.setInterval(() => setRefreshNonce((n) => n + 1), REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setRefreshNonce((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // System-health widgets: independent of activeClinic (backup/storage/
  // activity aren't per-clinic concepts), so kept in their own effect keyed
  // only on refreshNonce -- switching the clinic filter shouldn't refetch
  // these needlessly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [health, storage, events, payments, quickAccess] = await Promise.all([
          getBackupHealthSummary(),
          getStorageEstimate(),
          getRecentOperationalEvents(8),
          getRecentPayments(6),
          getQuickAccessPatients(8),
        ]);
        if (cancelled) return;
        setBackupHealth(health);
        setStorageEstimate(storage);
        setLastBackupAt(getLastBackupAt());
        setRecentActivity(events);
        setRecentPayments(payments);
        setQuickAccessPatients(quickAccess);
      } catch (err) {
        console.error("[DashboardPage] Failed to load system-health widgets:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [patients, allConsultations, rawAlerts, actionResult, paymentResult] = await Promise.all([
          patientRepository.list(),
          getAllConsultations(),
          getFollowUpAlerts(),
          getDashboardActionData(),
          getPaymentSummary(new Date(), activeClinic === "All" ? undefined : activeClinic),
        ]);
        setActionData(actionResult);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayKey = today.toISOString().slice(0, 10);

        const consultations = activeClinic === "All"
          ? allConsultations 
          : allConsultations.filter(c => c.clinicId === activeClinic);

        let patientsToday = 0;
        const last7Counts = new Map<string, number>();
        const last7 = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().slice(5, 10); // MM-DD
        });
        last7.forEach((k) => last7Counts.set(k, 0));

        const outcomeStats = {
          [ConsultationOutcome.IMPROVED]: 0,
          [ConsultationOutcome.PARTIAL]: 0,
          [ConsultationOutcome.NO_CHANGE]: 0,
          [ConsultationOutcome.WORSE]: 0,
          [ConsultationOutcome.FIRST_VISIT]: 0,
          total: 0
        };

        const remedyStats: Record<string, { used: number; improved: number }> = {};
        const patientById = new Map(patients.map((p) => [p.id, p] as const));
        const patientLatestConsultations = new Map<string, Consultation[]>();
        let incompleteRecords = 0;
        const activePatientIds = new Set<string>();

        consultations.forEach((c) => {
          const dateKey = String(c.date || "").slice(0, 10);

          if (dateKey === todayKey) {
            patientsToday += 1;
          }

          if (dateKey) {
            const k = dateKey.slice(5, 10);
            if (last7Counts.has(k)) last7Counts.set(k, (last7Counts.get(k) || 0) + 1);
          }

          const outcome = normalizeOutcome(c.outcome);
          outcomeStats[outcome]++;
          outcomeStats.total++;

          if (!c.outcome || (c.medicines || []).length === 0) incompleteRecords++;

          activePatientIds.add(c.patientId);

          const history = patientLatestConsultations.get(c.patientId) || [];
          history.push(c);
          history.sort((a, b) => b.date.localeCompare(a.date));
          if (history.length > 2) history.length = 2;
          patientLatestConsultations.set(c.patientId, history);

          c.medicines?.forEach((m) => {
            const rName = m.name;
            if (!rName) return;
            if (!remedyStats[rName]) remedyStats[rName] = { used: 0, improved: 0 };
            remedyStats[rName].used++;
            if (outcome === ConsultationOutcome.IMPROVED) remedyStats[rName].improved++;
          });
        });

        const highRiskPatients: Array<{ id: string; name: string; reason: string }> = [];
        patientLatestConsultations.forEach((history, pId) => {
          const lastOutcome = normalizeOutcome(history[0]?.outcome);
          const pName = patientById.get(pId)?.name || "Unknown Patient";

          if (lastOutcome === ConsultationOutcome.WORSE) {
            highRiskPatients.push({ id: pId, name: pName, reason: "Clinical Worsening Detected" });
          } else if (history.length >= 2 &&
                     normalizeOutcome(history[0].outcome) === ConsultationOutcome.NO_CHANGE &&
                     normalizeOutcome(history[1].outcome) === ConsultationOutcome.NO_CHANGE) {
            highRiskPatients.push({ id: pId, name: pName, reason: "Clinical Plateau (2+ Visits)" });
          }
        });

        const filteredPatients = activeClinic === "All"
            ? patients
            : patients.filter(p => activePatientIds.has(p.id));

        const actionableFollowUps = filteredPatients.filter(p => {
            const isDue = p.nextFollowUpDate && new Date(p.nextFollowUpDate) <= today;
            return isDue && isValidPhone(p.phone);
        }).length;

        const filteredAlerts = activeClinic === "All" 
            ? rawAlerts 
            : rawAlerts.filter(a => activePatientIds.has(a.patientId));

        setStats({
          totalPatients: filteredPatients.length,
          totalConsultations: consultations.length,
          followUpsDue: actionableFollowUps,
          patientsToday,
          todayPaid: paymentResult.collectedToday,
          todayPending: paymentResult.pendingCollectionToday,
          monthPaid: paymentResult.collectedThisMonth,
          last7Days: last7.map((k) => ({ day: k, count: last7Counts.get(k) || 0 })),
          outcomeStats,
          remedyStats,
          highRiskPatients,
          dataHealth: {
            incomplete: incompleteRecords,
            total: consultations.length,
            score: Math.round(((consultations.length - incompleteRecords) / (consultations.length || 1)) * 100)
          }
        });
        setAlerts(filteredAlerts);
      } catch (error) {
        console.error("Critical Dashboard Failure:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [activeClinic, refreshNonce]);

  const outcomeChartData = useMemo(() => {
    if (!stats) return null;
    const { total, ...distribution } = stats.outcomeStats;
    return {
      labels: ["Improved", "Partial", "Same", "Worse", "First"],
      datasets: [{
        data: [
          distribution[ConsultationOutcome.IMPROVED],
          distribution[ConsultationOutcome.PARTIAL],
          distribution[ConsultationOutcome.NO_CHANGE],
          distribution[ConsultationOutcome.WORSE],
          distribution[ConsultationOutcome.FIRST_VISIT],
        ],
        backgroundColor: ['#10b981', '#3b82f6', '#94a3b8', '#ef4444', '#8b5cf6'],
        borderWidth: 0,
      }]
    };
  }, [stats]);

  const activeCardConfig = activeCardKey ? ACTION_CARDS.find((c) => c.key === activeCardKey) || null : null;

  const activeCardEntries: FilteredListEntry[] = useMemo(() => {
    if (!activeCardKey || !actionData) return [];
    return actionData[activeCardKey].map((r: DashboardPatientRef) => ({
      patientId: r.patientId,
      name: r.name,
      phone: r.phone,
      subtitle: r.detail,
    }));
  }, [activeCardKey, actionData]);

  const handleSelectPatientFromCard = (patientId: string) => {
    setActivePatientId(patientId);
    onNavigate("patients");
  };

  // Manual reminders only (Module 2) -- this queues a pending, doctor-
  // editable reminder per selected patient and hands off to the Reminder
  // Center, where the doctor reviews/edits/approves before anything is
  // actually sent via WhatsApp. Nothing here sends a message on its own.
  const handleSendRemindersFromCard = async (patientIds: string[]) => {
    if (!activeCardKey || !actionData) return;
    const refs = actionData[activeCardKey];
    for (const patientId of patientIds) {
      const ref = refs.find((r: DashboardPatientRef) => r.patientId === patientId);
      if (!ref) continue;
      const alreadyQueued = await hasActiveReminder(patientId, "custom");
      if (alreadyQueued) continue;
      await enqueueReminder({
        patientId,
        patientName: ref.name,
        phone: ref.phone,
        type: "custom",
        message: buildGenericReminderMessage(ref.name),
        dueAt: new Date().toISOString(),
        sourceRef: `dashboard:${activeCardKey}`,
      });
    }
    setActiveCardKey(null);
    onNavigate("reminders");
  };

  if (loading) {
    return (
      <PullToRefreshScrollRegion
        onRefresh={async () => {
          haptic("tap");
          setRefreshNonce((n) => n + 1);
        }}
      >
      <ResponsiveContainer data-testid="dashboard-root" className="sakhi-page">
        <div className="sakhi-stack">
          <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-micro">Dashboard</div>
              <div className="sakhi-title">Clinic Ops</div>
            </div>
            <div className="sakhi-skeleton" style={{ width: 170, height: 48 }} />
          </div>
          <div className="sakhi-skeleton" style={{ height: 110, borderRadius: "var(--radius-4)" }} />
          <div className="sakhi-skeleton" style={{ height: 170, borderRadius: "var(--radius-4)" }} />
          <div className="sakhi-skeleton" style={{ height: 160, borderRadius: "var(--radius-4)" }} />
        </div>
      </ResponsiveContainer>
      </PullToRefreshScrollRegion>
    );
  }

  if (activeCardKey && activeCardConfig) {
    return (
      <FilteredPatientList
        title={activeCardConfig.label}
        entries={activeCardEntries}
        emptyMessage={activeCardConfig.emptyMessage}
        onSelectPatient={handleSelectPatientFromCard}
        onBack={() => setActiveCardKey(null)}
        selectable
        onSendReminders={handleSendRemindersFromCard}
      />
    );
  }

  if (isMobile) {
    const successRate = Math.round(((stats?.outcomeStats[ConsultationOutcome.IMPROVED] || 0) / (stats?.outcomeStats.total || 1)) * 100);
    const waiting = (queue || []).filter((e) => e.status === "waiting").length;
    const inProgress = (queue || []).find((e) => e.status === "in-progress") || null;
    const inConsultationCount = (queue || []).filter((e) => e.status === "in-progress").length;
    const todayPaid = Math.round(stats?.todayPaid || 0);
    const todayPending = Math.round(stats?.todayPending || 0);
    const monthPaid = Math.round(stats?.monthPaid || 0);
    const trendMax = Math.max(1, ...(stats?.last7Days || []).map((d) => d.count));
    return (
      <ResponsiveContainer data-testid="dashboard-root" className="sakhi-page">
        <div className="sakhi-row" style={{ justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div className="sakhi-micro">Dashboard</div>
            <div className="sakhi-title">Clinic Ops</div>
          </div>
          <select value={activeClinic} onChange={(e) => setActiveClinic(e.target.value)} className="sakhi-input" style={{ width: 170, height: 48 }}>
            <option value="All">All</option>
            <option value="Dabholi">Dabholi</option>
            <option value="City Light">City Light</option>
          </select>
        </div>

        {/* SECTION 1 — Primary Operational Actions: kept first (above the
            filtered-workflow cards below) because "start the next
            consultation" is the single most time-critical, highest-
            frequency action a doctor takes, and needs to stay reachable
            in the first viewport without scrolling. */}
        <MobileCard data-testid="dashboard-primary-actions" style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Actions</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
            <button
              data-testid="dashboard-primary-continue"
              className="sakhi-btn-primary sakhi-tap sakhi-focus-ring"
              style={{ minHeight: 56 }}
              onClick={() => {
                haptic("tap");
                if (inProgress) {
                  setActiveConsultation(inProgress.patientId, inProgress.appointmentId);
                  onNavigate("consultation");
                } else {
                  onNavigate("today");
                }
              }}
            >
              {inProgress ? "Continue" : "Start next"}
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
              <button
                className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
                style={{ minHeight: 56 }}
                onClick={() => { haptic("tap"); onNavigate("today"); }}
              >
                Start next patient
              </button>
              <button
                className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
                style={{ minHeight: 56 }}
                onClick={() => { haptic("tap"); onNavigate("today"); }}
              >
                Add walk-in
              </button>
              <button
                className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
                style={{ minHeight: 56 }}
                onClick={() => { haptic("tap"); onNavigate("today"); }}
              >
                Queue
              </button>
              <button
                className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
                style={{ minHeight: 56 }}
                onClick={() => { haptic("tap"); onNavigate("patients"); }}
              >
                Pending follow-ups
              </button>
            </div>
          </div>
        </MobileCard>

        {/* SECTION 2 — Doctor Action Dashboard: every card is a doorway into a filtered workflow, not a statistic */}
        <MobileCard data-testid="dashboard-action-cards" style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Today's Actions</div>
          {/* 9 cards in a 2-column grid ran 5 rows deep -- on a real small
              phone (Pixel 5-class, ~393x727) that pushed several rows down
              into the space the fixed bottom nav always occupies, not just
              a scroll-past-the-fold issue (the cards partially rendered
              behind the nav even on first paint, no scrolling involved).
              3 columns (3 rows) plus the tightened padding/type scale below
              clears it with real margin, and reads as a more scannable
              grid for 9 items besides. */}
          <div style={{ marginTop: "var(--space-2)", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
            {ACTION_CARDS.map((card) => {
              const count = actionData ? actionData[card.key].length : 0;
              return (
                <button
                  key={card.key}
                  type="button"
                  data-testid={`dashboard-action-card-${card.key}`}
                  className="sakhi-tap sakhi-focus-ring sakhi-ripple"
                  onClick={() => {
                    haptic("tap");
                    if (card.navigateTo) onNavigate(card.navigateTo);
                    else setActiveCardKey(card.key);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "5px 8px",
                    borderRadius: "var(--radius-3)",
                    border: `1px solid ${card.color}33`,
                    background: `${card.color}0f`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, lineHeight: 1 }}>{card.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 950, color: card.color, marginTop: 2, lineHeight: 1.1 }}>{count}</div>
                  <div className="sakhi-caption" style={{ marginTop: 1, lineHeight: 1.1, fontSize: 9.5 }}>{card.label}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            <div className="sakhi-surface" style={{ padding: "var(--space-2)", borderRadius: "var(--radius-2)", boxShadow: "none" }}>
              <div className="sakhi-caption">Consultations done</div>
              <div className="sakhi-body" style={{ fontWeight: 900 }}>{actionData?.consultationsCompletedToday ?? 0}</div>
            </div>
            <div className="sakhi-surface" style={{ padding: "var(--space-2)", borderRadius: "var(--radius-2)", boxShadow: "none" }}>
              <div className="sakhi-caption">Consultations pending</div>
              <div className="sakhi-body" style={{ fontWeight: 900 }}>{actionData?.consultationsPendingToday ?? 0}</div>
            </div>
          </div>
        </MobileCard>

        {/* SECTION 3 — Compact Today Snapshot */}
        <MobileCard data-testid="dashboard-today-snapshot" elevated={false} style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", borderRadius: "var(--radius-3)" }}>
          <div className="sakhi-micro">Today</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-2)" }}>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Patients</div>
              <div className="sakhi-title" style={{ marginTop: "var(--space-1)" }}>{stats?.patientsToday || 0}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Waiting</div>
              <div className="sakhi-title" style={{ marginTop: "var(--space-1)", color: "var(--brand)" }}>{waiting}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Collected</div>
              <div className="sakhi-title" style={{ marginTop: "var(--space-1)", color: "#16a34a" }}>₹{todayPaid}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Avg consult</div>
              <div className="sakhi-caption" style={{ marginTop: "var(--space-1)", color: "#94a3b8" }}>not tracked</div>
            </div>
          </div>
          <div className="sakhi-row" style={{ marginTop: "var(--space-2)", flexWrap: "wrap" }}>
            <span className="sakhi-pill">Pending ₹{todayPending}</span>
            <span className="sakhi-pill">Month ₹{monthPaid}</span>
            <span className="sakhi-pill">Success {successRate}%</span>
          </div>
        </MobileCard>

        {/* SECTION 4 — Queue Intelligence */}
        <MobileCard data-testid="dashboard-queue-intel" style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Queue intelligence</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
            {(alerts || []).slice(0, 6).map((alert, i) => (
              <div key={i} className="sakhi-surface" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", minWidth: 0, padding: "var(--space-2)", borderRadius: "var(--radius-2)", boxShadow: "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sakhi-body" style={{ fontWeight: 900, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.patientName || "Patient"}</div>
                  <div className="sakhi-caption" style={{ marginTop: "var(--space-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.message}</div>
                </div>
                <button
                  type="button"
                  className="sakhi-tap sakhi-focus-ring"
                  onClick={() => openWhatsApp({ phone: alert.phone || "", message: alert.message })}
                  style={{ minHeight: 48, padding: "0 var(--space-3)", borderRadius: "var(--radius-2)", border: "1px solid rgba(13,115,119,0.25)", background: "rgba(13,115,119,0.10)", color: "var(--brand-ink, #064e52)", fontWeight: 900, fontSize: "var(--type-caption)" }}
                >
                  WhatsApp
                </button>
              </div>
            ))}
            {alerts.length === 0 && <div className="sakhi-caption">All clear.</div>}
          </div>
        </MobileCard>

        {/* SECTION 5 — Compact finance + mini trend */}
        <MobileCard data-testid="dashboard-mini-trend" elevated={false} style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Trend</div>
          <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            {(stats?.last7Days || []).map((d) => (
              <div key={d.day} style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    height: Math.max(6, Math.round((d.count / trendMax) * 36)),
                    borderRadius: "var(--radius-1)",
                    background: "rgba(13, 115, 119, 0.22)",
                    border: "1px solid rgba(13, 115, 119, 0.18)",
                  }}
                  title={`${d.day}: ${d.count}`}
                />
                <div className="sakhi-micro" style={{ marginTop: "var(--space-1)", textAlign: "center" }}>
                  {d.day.split("-")[1]}
                </div>
              </div>
            ))}
          </div>
          <div className="sakhi-caption" style={{ marginTop: "var(--space-2)" }}>Last 7 days consult volume</div>
        </MobileCard>

        {/* SECTION 6 — Today's Operations (Appointments / In Consultation) */}
        <MobileCard data-testid="dashboard-operations" elevated={false} style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", borderRadius: "var(--radius-3)" }}>
          <div className="sakhi-micro">Operations</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2)" }}>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Today's Appointments</div>
              <div className="sakhi-title" style={{ marginTop: "var(--space-1)" }}>{actionData?.todaysAppointmentsCount ?? 0}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">In Consultation</div>
              <div className="sakhi-title" style={{ marginTop: "var(--space-1)", color: "var(--brand)" }}>{inConsultationCount}</div>
            </div>
          </div>
        </MobileCard>

        {/* SECTION 7 — System Health (Backup Health / Last Backup / Storage Used) */}
        <MobileCard data-testid="dashboard-system-health" style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">System health</div>
          {backupHealth && (
            <div
              className="sakhi-row"
              style={{
                gap: 8,
                alignItems: "center",
                marginTop: "var(--space-2)",
                padding: "var(--space-2)",
                borderRadius: 10,
                background:
                  backupHealth.level === "healthy" ? "rgba(21,128,61,0.08)" : backupHealth.level === "attention" ? "rgba(180,83,9,0.08)" : "rgba(185,28,28,0.08)",
              }}
            >
              <span
                className="sakhi-body"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: backupHealth.level === "healthy" ? "#15803d" : backupHealth.level === "attention" ? "#b45309" : "#b91c1c",
                }}
              >
                {backupHealth.message}
              </span>
            </div>
          )}
          <div style={{ marginTop: "var(--space-2)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2)" }}>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Last Backup</div>
              <div className="sakhi-body" style={{ marginTop: "var(--space-1)", fontWeight: 900 }}>
                {lastBackupAt ? new Date(lastBackupAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Never"}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sakhi-caption">Storage Used</div>
              <div className="sakhi-body" style={{ marginTop: "var(--space-1)", fontWeight: 900 }}>
                {storageEstimate?.usageBytes != null
                  ? `${formatBytes(storageEstimate.usageBytes)}${storageEstimate.quotaBytes ? ` / ${formatBytes(storageEstimate.quotaBytes)}` : ""}`
                  : "Not available"}
              </div>
            </div>
          </div>
        </MobileCard>

        {/* SECTION 7b — Recent Payments */}
        <MobileCard data-testid="dashboard-recent-payments" elevated={false} style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Recent payments</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
            {recentPayments.length === 0 ? (
              <div className="sakhi-caption">No payments recorded yet.</div>
            ) : (
              recentPayments.map((p) => (
                <button
                  type="button"
                  key={p.consultationId}
                  onClick={() => { setActivePatientId(p.patientId); onNavigate("patients"); }}
                  style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <span className="sakhi-caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, color: "#0f172a", fontWeight: 700 }}>
                    {p.patientName}
                  </span>
                  <span className="sakhi-caption" style={{ color: "#16a34a", fontWeight: 800, flexShrink: 0 }}>
                    ₹{p.amount.toLocaleString("en-IN")}
                  </span>
                </button>
              ))
            )}
          </div>
        </MobileCard>

        {/* SECTION 7c — Quick Access (Doctor Productivity: Pinned + Recent Patients) */}
        <MobileCard data-testid="dashboard-quick-access" elevated={false} style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Quick access</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
            {quickAccessPatients.length === 0 ? (
              <div className="sakhi-caption">No patients yet. Pin a patient from their profile for quick access.</div>
            ) : (
              quickAccessPatients.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  data-testid={`dashboard-quick-access-${p.id}`}
                  onClick={() => { setActivePatientId(p.id); onNavigate("patients"); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <span className="sakhi-caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, color: "#0f172a", fontWeight: 700 }}>
                    {p.pinned ? "★ " : ""}{p.name}
                  </span>
                  {p.lastVisit && (
                    <span className="sakhi-caption" style={{ color: "#94a3b8", flexShrink: 0 }}>
                      {new Date(p.lastVisit).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </MobileCard>

        {/* SECTION 8 — Recent Activity */}
        <MobileCard data-testid="dashboard-recent-activity" elevated={false} style={{ marginTop: "var(--space-3)", borderRadius: "var(--radius-4)" }}>
          <div className="sakhi-micro">Recent activity</div>
          <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
            {recentActivity.length === 0 ? (
              <div className="sakhi-caption">No recent activity recorded.</div>
            ) : (
              recentActivity.slice(0, 5).map((event) => (
                <div key={event.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", minWidth: 0 }}>
                  <span className="sakhi-caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {event.message}
                  </span>
                  <span className="sakhi-caption" style={{ color: "#94a3b8", flexShrink: 0 }}>
                    {new Date(event.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        </MobileCard>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer data-testid="dashboard-root" className="sakhi-workstation">
      <div className="sakhi-rail">
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Clinic Command Center</h1>
          <p style={subtitleStyle}>Sakhi Practice Management — Production V12.8</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={healthBadgeStyle(stats?.dataHealth.score || 0)}>
            System Health: {stats?.dataHealth.score}%
          </div>

          {/* ✅ Step 3: Trash button using onNavigate — no window.location.hash */}
          <button
            onClick={() => onNavigate("trash")}
            style={{
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-1)",
              border: "1.5px solid #e2e8f0",
              background: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            🗑️ Trash
          </button>

          <select
            value={activeClinic}
            onChange={(e) => setActiveClinic(e.target.value)}
            style={clinicSelectStyle}
          >
            <option value="All">All Branches</option>
            <option value="Dabholi">Dabholi Branch</option>
            <option value="City Light">City Light Branch</option>
          </select>
        </div>
      </header>

      {/* Doctor Action Dashboard -- every card opens a filtered workflow, not a statistic */}
      <div style={{ ...panelStyle, marginBottom: 24 }}>
        <h3 style={panelTitleStyle}>Today's Actions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {ACTION_CARDS.map((card) => {
            const count = actionData ? actionData[card.key].length : 0;
            return (
              <button
                key={card.key}
                type="button"
                data-testid={`dashboard-action-card-${card.key}`}
                onClick={() => (card.navigateTo ? onNavigate(card.navigateTo) : setActiveCardKey(card.key))}
                style={{
                  textAlign: "left",
                  padding: 16,
                  borderRadius: 16,
                  border: `1px solid ${card.color}33`,
                  background: `${card.color}0f`,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 18 }}>{card.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 950, color: card.color, marginTop: 6 }}>{count}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginTop: 2 }}>{card.label}</div>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            Consultations done today: <strong style={{ color: "#0f172a" }}>{actionData?.consultationsCompletedToday ?? 0}</strong>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            Consultations pending today: <strong style={{ color: "#0f172a" }}>{actionData?.consultationsPendingToday ?? 0}</strong>
          </div>
        </div>
      </div>

      {/* KPI Section */}
      <div
        style={{
          ...statGridStyle,
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : statGridStyle.gridTemplateColumns,
          gap: isMobile ? 12 : 16,
          marginBottom: isMobile ? 16 : 24,
        }}
      >
        <SummaryCard label="Branch Patients" val={stats?.totalPatients} color="#2563eb" />
        <SummaryCard label="Actionable Follow-ups" val={stats?.followUpsDue} color="#d97706" />
        <SummaryCard label="High-Risk Cases" val={stats?.highRiskPatients.length} color="#ef4444" />
        <SummaryCard
          label="Clinical Success Rate"
          val={`${Math.round(((stats?.outcomeStats[ConsultationOutcome.IMPROVED] || 0) / (stats?.outcomeStats.total || 1)) * 100)}%`}
          color="#10b981"
        />
        <SummaryCard label="Today's Appointments" val={actionData?.todaysAppointmentsCount} color="#0d7377" />
        <SummaryCard label="In Consultation" val={(queue || []).filter((e) => e.status === "in-progress").length} color="#7c3aed" />
      </div>

      <div
        style={{
          ...mainGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : mainGridStyle.gridTemplateColumns,
          gap: isMobile ? 12 : 16,
        }}
      >
        {/* Risk Management Panel */}
        <div
          style={{
            ...panelStyle,
            padding: isMobile ? 16 : 24,
            borderRadius: isMobile ? 20 : 24,
          }}
        >
          <h3 style={panelTitleStyle}>⚠️ Clinical Priority Review</h3>
          <div style={riskListStyle}>
            {stats?.highRiskPatients.length === 0 ? (
              <div style={emptyPlaceholderStyle}>No clinical risk patterns detected in this clinic.</div>
            ) : stats?.highRiskPatients.map((p, i) => (
              <div key={i} style={riskItemStyle}>
                <div>
                  <div style={riskNameStyle}>{p.name}</div>
                  <div style={riskReasonStyle}>{p.reason}</div>
                </div>
                <button
                  style={actionButtonStyle}
                  onClick={() => {
                    setActivePatientId(String(p.id));
                    onNavigate("patients");
                  }}
                >
                  Open Case
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Analytics Section */}
        {!isMobile && (
          <div style={panelStyle}>
            <h3 style={panelTitleStyle}>Success Distribution</h3>
            <div style={{ height: 280 }}>
              {outcomeChartData && (
                <Pie data={outcomeChartData} options={{ maintainAspectRatio: false }} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Follow-up Alerts Grid */}
      <div
        style={{
          ...panelStyle,
          marginTop: isMobile ? 16 : 24,
          padding: isMobile ? 16 : 24,
          borderRadius: isMobile ? 20 : 24,
        }}
      >
        <h3 style={panelTitleStyle}>Communication & Reminder Queue</h3>
        <div
          style={{
            ...alertGridStyle,
            gridTemplateColumns: isMobile ? "1fr" : alertGridStyle.gridTemplateColumns,
            gap: isMobile ? 10 : 12,
          }}
        >
          {alerts.length === 0 ? (
            <div style={{ ...emptyPlaceholderStyle, gridColumn: '1 / -1' }}>
              Queue is currently clear.
            </div>
          ) : alerts.map((alert, i) => {
            const hasPhone = isValidPhone(alert.phone || "");
            const isCritical = alert.type === "HIGH_RISK";
            return (
              <div
                key={i}
                style={{
                  ...alertCardStyle,
                  borderColor: isCritical ? '#fecaca' : '#e2e8f0',
                  background: isCritical ? '#fffcfc' : '#f8fafc',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: isCritical ? '#991b1b' : '#1e293b' }}>
                    {alert.patientName}
                  </div>
                  <div style={alertMessageStyle(alert.type)}>{alert.message}</div>
                </div>
                <button
                  disabled={!hasPhone}
                  onClick={() => openWhatsApp({ phone: alert.phone || "", message: alert.message })}
                  style={notifyButtonStyle(hasPhone, isCritical)}
                >
                  {hasPhone ? "📲 Notify" : "🚫 No Phone"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🔐 DATA BACKUP & RESTORE */}
      <div
        style={{
          ...panelStyle,
          marginTop: isMobile ? 16 : 24,
          padding: isMobile ? 16 : 24,
          borderRadius: isMobile ? 20 : 24,
        }}
      >
        <h3 style={panelTitleStyle}>🔐 Data Safety & Backup</h3>
        {backupHealth && (
          <div
            data-testid="dashboard-backup-health"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 10,
              marginBottom: 16,
              background:
                backupHealth.level === "healthy" ? "rgba(21,128,61,0.08)" : backupHealth.level === "attention" ? "rgba(180,83,9,0.08)" : "rgba(185,28,28,0.08)",
              color: backupHealth.level === "healthy" ? "#15803d" : backupHealth.level === "attention" ? "#b45309" : "#b91c1c",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {backupHealth.message}
          </div>
        )}
        <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            Last Backup: <strong style={{ color: "#0f172a" }}>{lastBackupAt ? new Date(lastBackupAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</strong>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            Storage Used: <strong style={{ color: "#0f172a" }}>
              {storageEstimate?.usageBytes != null
                ? `${formatBytes(storageEstimate.usageBytes)}${storageEstimate.quotaBytes ? ` / ${formatBytes(storageEstimate.quotaBytes)}` : ""}`
                : "Not available"}
            </strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            onClick={exportBackup}
            style={{
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-1)",
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            📦 Download Backup
          </button>
          <label
            style={{
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-1)",
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            📥 Restore Backup
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  importBackup(e.target.files[0]);
                }
              }}
            />
          </label>
        </div>
        <div style={{ marginTop: "var(--space-2)", fontSize: 12, color: "#64748b" }}>
          ⚠️ Restoring backup will overwrite all existing data. Use carefully.
        </div>
      </div>

      {/* Recent Payments */}
      <div
        data-testid="dashboard-recent-payments"
        style={{
          ...panelStyle,
          marginTop: isMobile ? 16 : 24,
          padding: isMobile ? 16 : 24,
          borderRadius: isMobile ? 20 : 24,
        }}
      >
        <h3 style={panelTitleStyle}>Recent Payments</h3>
        {recentPayments.length === 0 ? (
          <div style={emptyPlaceholderStyle}>No payments recorded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {recentPayments.map((p) => (
              <button
                type="button"
                key={p.consultationId}
                onClick={() => { setActivePatientId(p.patientId); onNavigate("patients"); }}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0 }}
              >
                <span style={{ color: "#334155", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{p.patientName}</span>
                <span style={{ color: "#16a34a", fontWeight: 800, flexShrink: 0 }}>₹{p.amount.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Access (Doctor Productivity: Pinned + Recent Patients) */}
      <div
        data-testid="dashboard-quick-access"
        style={{
          ...panelStyle,
          marginTop: isMobile ? 16 : 24,
          padding: isMobile ? 16 : 24,
          borderRadius: isMobile ? 20 : 24,
        }}
      >
        <h3 style={panelTitleStyle}>Quick Access</h3>
        {quickAccessPatients.length === 0 ? (
          <div style={emptyPlaceholderStyle}>No patients yet. Pin a patient from their profile for quick access.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {quickAccessPatients.map((p) => (
              <button
                type="button"
                key={p.id}
                data-testid={`dashboard-quick-access-${p.id}`}
                onClick={() => { setActivePatientId(p.id); onNavigate("patients"); }}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0 }}
              >
                <span style={{ color: "#334155", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {p.pinned ? "★ " : ""}{p.name}
                </span>
                {p.lastVisit && (
                  <span style={{ color: "#94a3b8", fontWeight: 700, flexShrink: 0 }}>
                    {new Date(p.lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div
        data-testid="dashboard-recent-activity"
        style={{
          ...panelStyle,
          marginTop: isMobile ? 16 : 24,
          padding: isMobile ? 16 : 24,
          borderRadius: isMobile ? 20 : 24,
        }}
      >
        <h3 style={panelTitleStyle}>Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div style={emptyPlaceholderStyle}>No recent activity recorded.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {recentActivity.slice(0, 8).map((event) => (
              <div key={event.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, minWidth: 0 }}>
                <span style={{ color: "#334155", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{event.message}</span>
                <span style={{ color: "#94a3b8", fontWeight: 700, flexShrink: 0 }}>
                  {new Date(event.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      </div>
    </ResponsiveContainer>
  );
};

// --- Styles ---
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 };
const titleStyle: React.CSSProperties = { fontSize: 18, fontWeight: 950, color: "#0f172a", margin: 0, letterSpacing: "-0.2px" };
const subtitleStyle: React.CSSProperties = { color: "#64748b", marginTop: 6, fontSize: 12, fontWeight: 800 };
const clinicSelectStyle: React.CSSProperties = { padding: "0 var(--space-3)", height: 44, borderRadius: 999, border: "1px solid var(--border)", background: "rgba(2,6,23,0.02)", fontWeight: 900, cursor: 'pointer', outline: 'none' };
const healthBadgeStyle = (score: number): React.CSSProperties => ({
  padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-1)", fontWeight: 800, fontSize: 12,
  background: score > 85 ? "#dcfce7" : "#fee2e2",
  color: score > 85 ? "#166534" : "#991b1b",
  border: `1px solid ${score > 85 ? "#22c55e" : "#ef4444"}`,
  textTransform: 'uppercase',
});
const statGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 };
const mainGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 };
const panelStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.92)', padding: 24, borderRadius: 24, border: '1px solid rgba(226, 232, 240, 0.9)', boxShadow: 'var(--shadow-1)' };
const panelTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 900, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.15em' };
const riskItemStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', borderRadius: 16, background: '#fff1f2', border: '1px solid #fecaca', marginBottom: 16 };
const riskNameStyle: React.CSSProperties = { fontWeight: 800, color: '#991b1b', fontSize: 16 };
const riskReasonStyle: React.CSSProperties = { fontSize: 13, color: '#be123c', marginTop: 4, fontWeight: 600 };
const actionButtonStyle: React.CSSProperties = { background: 'rgba(153, 27, 27, 0.10)', color: '#991b1b', border: '1px solid rgba(153, 27, 27, 0.20)', padding: '0 16px', height: 40, borderRadius: 999, cursor: 'pointer', fontWeight: 950, fontSize: 12 };
const alertGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 };
const alertCardStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: 16, border: '1px solid rgba(226, 232, 240, 0.9)', background: 'rgba(2, 6, 23, 0.02)' };
const alertMessageStyle = (type: string) => ({ fontSize: 12, fontWeight: 800, color: type === "HIGH_RISK" ? "#dc2626" : "#64748b", marginTop: 4 });
const notifyButtonStyle = (active: boolean, critical: boolean): React.CSSProperties => ({
  background: active ? (critical ? '#991b1b' : '#22c55e') : '#cbd5e1',
  color: '#fff', border: 'none', padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-1)', cursor: active ? 'pointer' : 'not-allowed', fontWeight: 800, fontSize: 12,
});
const SummaryCard = ({ label, val, color }: any) => (
  <div style={{ background: 'rgba(255,255,255,0.92)', padding: 20, borderRadius: 24, border: '1px solid rgba(226, 232, 240, 0.9)', boxShadow: '0 1px 0 rgba(15, 23, 42, 0.03) inset' }}>
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 950, color, marginTop: 8 }}>{val ?? 0}</div>
  </div>
);
const riskListStyle: React.CSSProperties = { maxHeight: 350, overflowY: 'auto' };
const emptyPlaceholderStyle: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14, fontStyle: 'italic' };
const loadingOverlayStyle: React.CSSProperties = { padding: 150, textAlign: 'center', fontSize: 20, color: '#64748b', fontWeight: 800 };

export default DashboardPage;
