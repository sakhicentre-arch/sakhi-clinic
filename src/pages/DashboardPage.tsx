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
  monthPending: number;
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [patients, allConsultations, rawAlerts] = await Promise.all([
          patientRepository.list(),
          getAllConsultations(),
          getFollowUpAlerts()
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayKey = today.toISOString().slice(0, 10);
        const monthKey = new Date().getMonth();

        const consultations = activeClinic === "All" 
          ? allConsultations 
          : allConsultations.filter(c => c.clinicId === activeClinic);

        let todayPaid = 0;
        let todayPending = 0;
        let monthPaid = 0;
        let monthPending = 0;
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
          const fee = Number(c.fee || 0);
          const pay = (c.paymentStatus || "pending") as any;

          if (dateKey === todayKey) {
            patientsToday += 1;
            if (pay === "paid") todayPaid += fee;
            else todayPending += fee;
          }
          const m = c.date ? new Date(c.date).getMonth() : -1;
          if (m === monthKey) {
            if (pay === "paid") monthPaid += fee;
            else monthPending += fee;
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
          todayPaid,
          todayPending,
          monthPaid,
          monthPending,
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

  if (isMobile) {
    const successRate = Math.round(((stats?.outcomeStats[ConsultationOutcome.IMPROVED] || 0) / (stats?.outcomeStats.total || 1)) * 100);
    const waiting = (queue || []).filter((e) => e.status === "waiting").length;
    const inProgress = (queue || []).find((e) => e.status === "in-progress") || null;
    const todayPaid = Math.round(stats?.todayPaid || 0);
    const todayPending = Math.round(stats?.todayPending || 0);
    const monthPaid = Math.round(stats?.monthPaid || 0);
    const monthPending = Math.round(stats?.monthPending || 0);
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

        {/* SECTION 1 — Compact Today Snapshot */}
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
            <span className="sakhi-pill">Month ₹{monthPaid} / ₹{monthPending}</span>
            <span className="sakhi-pill">Success {successRate}%</span>
          </div>
        </MobileCard>

        {/* SECTION 2 — Primary Operational Actions */}
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

        {/* SECTION 3 — Queue Intelligence */}
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

        {/* SECTION 4/5 — Compact finance + mini trend */}
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
