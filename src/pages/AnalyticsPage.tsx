import React, { useEffect, useMemo, useState } from "react";
import { useConsultationStore } from "../store/useConsultationStore";
import { useAppointmentStore } from "../store/useAppointmentStore";
import { usePatientStore } from "../store/usePatientStore";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { getPaymentSummary, PaymentSummary } from "../services/paymentService";
import { getFollowUpAnalytics, FollowUpAnalytics } from "../services/followUpIntelligenceService";
import { getReminderAnalytics, ReminderAnalytics } from "../services/reminderAnalyticsService";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

/**
 * AnalyticsPage.tsx
 * Sakhi Clinic — Reports.
 *
 * Doctor Workflow Completion, item 5: previously computed revenue as
 * `totalVisits * 500` -- a hardcoded, fake assumption, not real payment
 * data -- and was never wired into any navigation, so no doctor could
 * actually reach it. Both fixed: revenue now comes from paymentService.ts
 * (the same source RevenuePage.tsx and the Patient Ledger already use, so
 * these numbers can never drift from what a patient's own ledger shows),
 * and this page is now reachable from the left nav ("Reports").
 *
 * The miasm/remedy/referral breakdowns below were already computed from
 * real consultation/patient data -- only the revenue figure was fake.
 * Follow-up compliance and reminder delivery stats are folded in from
 * followUpIntelligenceService.ts / reminderAnalyticsService.ts, both
 * already relied on by FollowUpPage.tsx / RemindersPage.tsx -- no new
 * data-access logic introduced here.
 */

type ReportPeriod = "daily" | "monthly";

export default function AnalyticsPage() {
  const consultations = useConsultationStore((s) => s.consultations);
  const appointments = useAppointmentStore((s) => s.appointments);
  const patients = usePatientStore((s) => s.patients);

  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [loading, setLoading] = useState(true);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [followUpAnalytics, setFollowUpAnalytics] = useState<FollowUpAnalytics | null>(null);
  const [reminderAnalytics, setReminderAnalytics] = useState<ReminderAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [payments, followUps, reminders] = await Promise.all([
          getPaymentSummary(new Date()),
          getFollowUpAnalytics(),
          getReminderAnalytics(),
        ]);
        if (cancelled) return;
        setPaymentSummary(payments);
        setFollowUpAnalytics(followUps);
        setReminderAnalytics(reminders);
      } catch (err) {
        console.error("[AnalyticsPage] Failed to load report data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- CORE ENGINE: Aggregate Logic (real consultation/patient data --
  // unchanged from before, only the revenue figure below was fake) ---
  const stats = useMemo(() => {
    const totalVisits = consultations.length;
    const cityLightVisits = appointments.filter(a => a.clinic === "City Light" && a.status === "done").length;
    const dabholiVisits = appointments.filter(a => a.clinic === "Dabholi" && a.status === "done").length;

    const miasmCounts: Record<string, number> = { Psora: 0, Sycosis: 0, Syphilis: 0, Tubercular: 0 };
    consultations.forEach(c => {
      if (c.miasm && miasmCounts[c.miasm] !== undefined) {
        miasmCounts[c.miasm]++;
      }
    });

    const remedyCounts: Record<string, number> = {};
    consultations.forEach(c => {
      (c.medicines || []).forEach(m => {
        const coreName = m.name?.split(" ")[0] || "Unknown";
        remedyCounts[coreName] = (remedyCounts[coreName] || 0) + 1;
      });
    });

    const topRemedies = Object.entries(remedyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const referralMap: Record<string, number> = {};
    patients.forEach(p => {
      const src = p.referredBy || "Self";
      referralMap[src] = (referralMap[src] || 0) + 1;
    });

    return { totalVisits, cityLightVisits, dabholiVisits, topRemedies, miasmCounts, referralMap };
  }, [consultations, appointments, patients]);

  const revenueValue = period === "daily"
    ? paymentSummary?.collectedToday ?? 0
    : paymentSummary?.collectedThisMonth ?? 0;
  const revenueLabel = period === "daily" ? "Today's Collected Revenue" : "This Month's Collected Revenue";

  // --- UI Charts Configuration ---
  const miasmChartData = {
    labels: Object.keys(stats.miasmCounts),
    datasets: [{
      data: Object.values(stats.miasmCounts),
      backgroundColor: ["#3b82f6", "#10b981", "#f43f5e", "#f59e0b"],
      hoverOffset: 15
    }]
  };

  const remedyChartData = {
    labels: stats.topRemedies.map(r => r[0]),
    datasets: [{
      label: "Prescription Hits",
      data: stats.topRemedies.map(r => r[1]),
      backgroundColor: "rgba(99, 102, 241, 0.8)",
      borderColor: "#6366f1",
      borderWidth: 2,
      borderRadius: 10
    }]
  };

  const referralChartData = {
    labels: Object.keys(stats.referralMap).slice(0, 5),
    datasets: [{
      label: "Patients Acquired",
      data: Object.values(stats.referralMap).slice(0, 5),
      backgroundColor: "#8b5cf6",
      borderRadius: 5
    }]
  };

  // --- UI Styles ---
  const cardStyle: React.CSSProperties = {
    background: "#fff", padding: "30px", borderRadius: "24px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.02)", border: "1px solid #f1f5f9"
  };

  return (
    <div data-testid="analytics-page" style={{ backgroundColor: "#f8fafc", minHeight: "100vh", padding: "40px" }}>

      {/* HEADER SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "36px", fontWeight: "900", color: "#1e3a8a" }}>Reports</h1>
          <p style={{ margin: "5px 0", color: "#64748b", fontSize: "16px" }}>Clinical performance, revenue, and operational statistics</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <button
              type="button"
              data-testid="analytics-period-daily"
              onClick={() => setPeriod("daily")}
              style={{
                padding: "10px 18px", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer",
                background: period === "daily" ? "#1e3a8a" : "#fff",
                color: period === "daily" ? "#fff" : "#64748b",
              }}
            >
              Daily
            </button>
            <button
              type="button"
              data-testid="analytics-period-monthly"
              onClick={() => setPeriod("monthly")}
              style={{
                padding: "10px 18px", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer",
                background: period === "monthly" ? "#1e3a8a" : "#fff",
                color: period === "monthly" ? "#fff" : "#64748b",
              }}
            >
              Monthly
            </button>
          </div>
          <div style={{ background: "#10b981", color: "#fff", padding: "12px 25px", borderRadius: "14px", fontWeight: "800" }}>
            {stats.totalVisits} RECORDS
          </div>
        </div>
      </div>

      {/* METRICS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px", marginBottom: "30px" }}>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>Lifetime Consultations</p>
          <h2 style={{ fontSize: "36px", fontWeight: "900", margin: "10px 0" }}>{stats.totalVisits}</h2>
        </div>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>{revenueLabel}</p>
          <h2 style={{ fontSize: "36px", fontWeight: "900", margin: "10px 0" }}>{loading ? "…" : `₹${revenueValue.toLocaleString("en-IN")}`}</h2>
          <p style={{ color: "#94a3b8", fontSize: "12px" }}>From actual recorded payments</p>
        </div>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>Outstanding Payments</p>
          <h2 style={{ fontSize: "36px", fontWeight: "900", margin: "10px 0", color: (paymentSummary?.outstandingAmount || 0) > 0 ? "#dc2626" : "#0f172a" }}>
            {loading ? "…" : `₹${Math.round(paymentSummary?.outstandingAmount || 0).toLocaleString("en-IN")}`}
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "12px" }}>{paymentSummary?.pendingPaymentsCount ?? 0} patient{paymentSummary?.pendingPaymentsCount === 1 ? "" : "s"} with a balance</p>
        </div>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>Follow-up Compliance</p>
          <h2 style={{ fontSize: "36px", fontWeight: "900", margin: "10px 0", color: "#10b981" }}>
            {loading ? "…" : `${followUpAnalytics?.completionRate ?? 0}%`}
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "12px" }}>{followUpAnalytics?.overdueCount ?? 0} currently overdue</p>
        </div>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>Reminder Delivery</p>
          <h2 style={{ fontSize: "36px", fontWeight: "900", margin: "10px 0" }}>
            {loading ? "…" : `${reminderAnalytics?.deliverySuccessRate ?? 0}%`}
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "12px" }}>{reminderAnalytics?.sentCount ?? 0} sent, {reminderAnalytics?.failedCount ?? 0} failed</p>
        </div>
      </div>

      {/* CHARTS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "30px", marginBottom: "30px" }}>

        {/* MIASMATIC PIE */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "30px", fontWeight: "900", color: "#0f172a" }}>Pathological Miasm Distribution</h3>
          <div style={{ height: "350px", display: "flex", justifyContent: "center" }}>
            <Pie data={miasmChartData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
          </div>
        </div>

        {/* TOP REMEDIES BAR */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "30px", fontWeight: "900", color: "#0f172a" }}>Top 5 Clinical Remedies</h3>
          <div style={{ height: "350px" }}>
            <Bar data={remedyChartData} options={{ maintainAspectRatio: false, scales: { x: { grid: { display: false } } } }} />
          </div>
        </div>
      </div>

      {/* SECONDARY INSIGHTS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>

        {/* REFERRAL BAR */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "25px", fontWeight: "900" }}>Referral Network Source Tracking</h3>
          <div style={{ height: "250px" }}>
            <Bar data={referralChartData} options={{ indexAxis: 'y', maintainAspectRatio: false }} />
          </div>
        </div>

        {/* RECENT CLINICAL LIST */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "20px", fontWeight: "900" }}>Recent Audit Logs</h3>
          <div style={{ maxHeight: "250px", overflowY: "auto" }}>
            <table width="100%" style={{ borderCollapse: "collapse" }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
                <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: "11px", borderBottom: "1px solid #f1f5f9" }}>
                  <th style={{ padding: "10px" }}>DATE</th>
                  <th style={{ padding: "10px" }}>REMEDY</th>
                  <th style={{ padding: "10px" }}>OUTCOME</th>
                </tr>
              </thead>
              <tbody>
                {consultations.slice(-8).reverse().map((c, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f8fafc", fontSize: "13px" }}>
                    <td style={{ padding: "12px" }}>{new Date(c.date).toLocaleDateString()}</td>
                    <td style={{ padding: "12px", fontWeight: "800" }}>{c.medicines[0]?.name || "N/A"}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "8px", background: "#f1f5f9", fontWeight: "700" }}>
                        {c.outcome || "First Consultation"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
