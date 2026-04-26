import React, { useMemo } from "react";
import { useConsultationStore } from "../store/useConsultationStore";
import { usePatientStore } from "../store/usePatientStore";
import { Activity, Brain, ShieldCheck, History } from "lucide-react";

/**
 * SAKHI CLINIC — REMEDY INTELLIGENCE WIDGET
 * PROTOCOL: ZERO TRUNCATION | REAL-TIME CLINICAL ADVICE
 */

export default function RemedyIntelligence() {
  const activeSession = useConsultationStore((s) => s.activeSession);
  const consultations = useConsultationStore((s) => s.consultations);
  const patients = usePatientStore((s) => s.patients);

  const patientId = activeSession?.patientId;

  // --- Intelligence Logic ---
  const patientData = useMemo(() => {
    if (!patientId) return null;
    
    const p = patients.find(curr => curr.id === patientId);
    const history = consultations.filter(c => c.patientId === patientId);
    const lastCase = history[0]; // Already sorted by date in store

    // Map Remedy Frequency
    const remedyMap: Record<string, number> = {};
    history.forEach(c => {
      c.medicines.forEach(m => {
        remedyMap[m.name] = (remedyMap[m.name] || 0) + 1;
      });
    });

    const frequentRemedies = Object.entries(remedyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { 
      name: p?.name, 
      miasm: lastCase?.miasm || "Unknown", 
      historyCount: history.length,
      frequentRemedies
    };
  }, [patientId, consultations, patients]);

  if (!activeSession || !patientData) return null;

  // --- Styles ---
  const widgetStyle: React.CSSProperties = {
    padding: "20px",
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
    width: "300px",
    position: "sticky",
    top: "20px",
    fontFamily: "'Inter', sans-serif"
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  };

  return (
    <div style={widgetStyle}>
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", color: "#1e3a8a", fontWeight: "900" }}>{patientData.name}</h3>
        <p style={{ margin: "4px 0", fontSize: "13px", color: "#64748b" }}>Clinical Intelligence Active</p>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <div style={sectionLabel}><Activity size={12} /> Current Miasmatic Layer</div>
        <div style={{ 
          background: "#eff6ff", color: "#2563eb", padding: "8px 12px", 
          borderRadius: "10px", fontWeight: "800", fontSize: "14px", textAlign: "center",
          border: "1px solid #bfdbfe"
        }}>
          {patientData.miasm.toUpperCase()}
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <div style={sectionLabel}><History size={12} /> Top Successful Remedies</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {patientData.frequentRemedies.map(([name, count]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ fontWeight: "700", color: "#334155" }}>{name}</span>
              <span style={{ color: "#94a3b8" }}>{count}x used</span>
            </div>
          ))}
          {patientData.frequentRemedies.length === 0 && <span style={{fontSize: '12px', color: '#cbd5e1'}}>No history available</span>}
        </div>
      </div>

      <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <div style={sectionLabel}><ShieldCheck size={12} color="#10b981" /> Decision Support</div>
        <p style={{ margin: 0, fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
          Patient has <b>{patientData.historyCount}</b> previous visits. Consider {patientData.miasm} remedies if current symptoms match the chronic pattern.
        </p>
      </div>
    </div>
  );
}