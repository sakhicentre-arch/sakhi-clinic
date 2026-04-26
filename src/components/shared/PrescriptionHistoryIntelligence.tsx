import React from "react";
import { TrendingUp, Clock } from "lucide-react";

interface PrescriptionHistoryProps {
  remedyHistory: Array<{
    remedy: string;
    date: string;
    outcome: string;
  }>;
}

export default function PrescriptionHistoryIntelligence({ remedyHistory }: PrescriptionHistoryProps) {
  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case "Improved": return "#15803d";
      case "Aggravation-Improvement": return "#0369a1";
      case "Partial": return "#92400e";
      case "NoChange": return "#475569";
      case "Worse": return "#991b1b";
      case "NewSymptoms": return "#6d28d9";
      default: return "#64748b";
    }
  };

  const getOutcomeBg = (outcome: string) => {
    switch (outcome) {
      case "Improved": return "#dcfce7";
      case "Aggravation-Improvement": return "#e0f2fe";
      case "Partial": return "#fef3c7";
      case "NoChange": return "#f1f5f9";
      case "Worse": return "#fee2e2";
      case "NewSymptoms": return "#ede9fe";
      default: return "#f8fafc";
    }
  };

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      border: "1px solid #e2e8f0",
      padding: 20,
      marginBottom: 16
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16
      }}>
        <TrendingUp size={16} color="#2563eb" />
        <span style={{
          fontSize: 14,
          fontWeight: 800,
          color: "#1e293b",
          textTransform: "uppercase",
          letterSpacing: 1
        }}>
          Prescription History
        </span>
      </div>

      {remedyHistory.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {remedyHistory.map((item, index) => (
            <div key={index} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "#fafbfc",
              borderRadius: 12,
              border: "1px solid #f1f5f9"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a"
                }}>
                  {item.remedy}
                </div>
                <div style={{
                  fontSize: 12,
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}>
                  <Clock size={12} />
                  {item.date}
                </div>
              </div>
              <div style={{
                background: getOutcomeBg(item.outcome),
                color: getOutcomeColor(item.outcome),
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 6,
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}>
                {item.outcome}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          color: "#94a3b8",
          fontSize: 13,
          textAlign: "center",
          padding: "20px"
        }}>
          No prescription history available
        </div>
      )}
    </div>
  );
}
