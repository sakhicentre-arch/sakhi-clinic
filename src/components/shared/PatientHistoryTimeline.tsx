import { useEffect, useState } from "react";
import { db, Consultation, ConsultationOutcome, normalizeOutcome } from "../../services/db";

/**
 * SAKHI CLINIC - PATIENT HISTORY TIMELINE
 * Goal: Track Hering's Law and Symptom Evolution
 */

export default function PatientHistoryTimeline({ patientId }: { patientId: string }) {
  const [history, setHistory] = useState<Consultation[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      const records = await db.consultations
        .where("patientId")
        .equals(patientId)
        .reverse() // Newest first
        .sortBy("date");
      setHistory(records);
    };
    fetchHistory();
  }, [patientId]);

  if (history.length === 0) return null;

  return (
    <div style={{ marginTop: "30px", borderTop: "2px solid #e2e8f0", paddingTop: "20px" }}>
      <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#1e293b", marginBottom: "15px" }}>
        Clinical Evolution (Last {history.length} Visits)
      </h3>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {history.map((c, i) => (
          <div key={i} style={{ 
            background: "#fff", 
            padding: "16px", 
            borderRadius: "12px", 
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "#475569" }}>
                {new Date(c.date).toLocaleDateString()}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                Rx: {c.medicines?.[0]?.name || "No Remedy Recorded"}
              </p>
            </div>
            
            <div style={{ 
              padding: "4px 10px", 
              borderRadius: "8px", 
              fontSize: "12px", 
              fontWeight: "700",
              background: normalizeOutcome(c.outcome) === ConsultationOutcome.IMPROVED ? "#dcfce7" : "#f1f5f9",
              color: normalizeOutcome(c.outcome) === ConsultationOutcome.IMPROVED ? "#166534" : "#475569"
            }}>
              {c.outcome?.toUpperCase() || "FOLLOW-UP"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
