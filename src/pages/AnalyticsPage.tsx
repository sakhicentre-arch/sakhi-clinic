import React, { useMemo } from "react";
import { useConsultationStore } from "../store/useConsultationStore";
import { useAppointmentStore } from "../store/useAppointmentStore";
import { usePatientStore } from "../store/usePatientStore";
import { Bar, Doughnut, Pie, Line } from "react-chartjs-2";
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
 * SAKHI HOMEOPATHIC CLINIC - MASTER ANALYTICS (V5.3)
 * ------------------------------------------------------------------------
 * PROTOCOL  : REVENUE & CLINICAL INTELLIGENCE | ZERO TRUNCATION
 * FIXES     : Repaired ts(2339) for outcome & Medicine access.
 * ------------------------------------------------------------------------
 */

export default function AnalyticsPage() {
  const consultations = useConsultationStore((s) => s.consultations);
  const appointments = useAppointmentStore((s) => s.appointments);
  const patients = usePatientStore((s) => s.patients);

  // --- CORE ENGINE: Aggregate Logic ---
  const stats = useMemo(() => {
    const totalVisits = consultations.length;
    const cityLightVisits = appointments.filter(a => a.clinic === "City Light" && a.status === "done").length;
    const dabholiVisits = appointments.filter(a => a.clinic === "Dabholi" && a.status === "done").length;
    
    // Financial Intelligence
    const totalRevenue = totalVisits * 500;

    // Miasmatic Intelligence (Synchronized with V8.0 Store)
    const miasmCounts: Record<string, number> = { Psora: 0, Sycosis: 0, Syphilis: 0, Tubercular: 0 };
    consultations.forEach(c => {
      if (c.miasm && miasmCounts[c.miasm] !== undefined) {
        miasmCounts[c.miasm]++;
      }
    });

    // Remedy Popularity Forensics
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

    // Referral Intelligence
    const referralMap: Record<string, number> = {};
    patients.forEach(p => {
      const src = p.referredBy || "Self";
      referralMap[src] = (referralMap[src] || 0) + 1;
    });

    return { totalVisits, totalRevenue, cityLightVisits, dabholiVisits, topRemedies, miasmCounts, referralMap };
  }, [consultations, appointments, patients]);

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
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", padding: "40px" }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "36px", fontWeight: "900", color: "#1e3a8a" }}>Sakhi Clinic Analytics</h1>
          <p style={{ margin: "5px 0", color: "#64748b", fontSize: "16px" }}>Clinical performance & pathological distribution data</p>
        </div>
        <div style={{ background: "#10b981", color: "#fff", padding: "12px 25px", borderRadius: "14px", fontWeight: "800" }}>
          SYSTEM ONLINE: {stats.totalVisits} RECORDS
        </div>
      </div>

      {/* METRICS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "30px", marginBottom: "30px" }}>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>Lifetime Consultations</p>
          <h2 style={{ fontSize: "42px", fontWeight: "900", margin: "10px 0" }}>{stats.totalVisits}</h2>
          <div style={{ color: "#10b981", fontWeight: "700" }}>↑ Growth Stable</div>
        </div>
        <div style={cardStyle}>
          <p style={{ color: "#64748b", fontWeight: "900", fontSize: "12px", textTransform: "uppercase" }}>Estimated Branch Revenue</p>
          <h2 style={{ fontSize: "42px", fontWeight: "900", margin: "10px 0" }}>₹{stats.totalRevenue.toLocaleString()}</h2>
          <p style={{ color: "#94a3b8", fontSize: "12px" }}>Assumption: ₹500/session</p>
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

        {/* RECENT CLINICAL LIST (REPAIRED & RESTORED) */}
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
                        {/* 🔥 FIXED: Now points to outcome to align with V8.0 Schema */}
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