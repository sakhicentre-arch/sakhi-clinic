import React from "react";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CaseProgression {
  totalVisits: number;
  treatmentDuration: string;
  remedyChanges: number;
  currentTrend: "Improving" | "Stable" | "Worsening" | "Unknown";
}

interface CaseProgressionTrackerProps {
  progression: CaseProgression;
}

export default function CaseProgressionTracker({ progression }: CaseProgressionTrackerProps) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "Improving": return <TrendingUp size={16} color="#15803d" />;
      case "Worsening": return <TrendingDown size={16} color="#dc2626" />;
      case "Stable": return <Minus size={16} color="#6b7280" />;
      default: return <Activity size={16} color="#6b7280" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "Improving": return "#15803d";
      case "Worsening": return "#dc2626";
      case "Stable": return "#6b7280";
      default: return "#6b7280";
    }
  };

  const getTrendBg = (trend: string) => {
    switch (trend) {
      case "Improving": return "#dcfce7";
      case "Worsening": return "#fee2e2";
      case "Stable": return "#f3f4f6";
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
        <Activity size={16} color="#2563eb" />
        <span style={{
          fontSize: 14,
          fontWeight: 800,
          color: "#1e293b",
          textTransform: "uppercase",
          letterSpacing: 1
        }}>
          Case Progression
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 16,
        marginBottom: 16
      }}>
        <div style={{
          textAlign: "center",
          padding: "12px",
          background: "#fafbfc",
          borderRadius: 12,
          border: "1px solid #f1f5f9"
        }}>
          <div style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
            marginBottom: 4
          }}>
            {progression.totalVisits}
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: 1
          }}>
            Total Visits
          </div>
        </div>

        <div style={{
          textAlign: "center",
          padding: "12px",
          background: "#fafbfc",
          borderRadius: 12,
          border: "1px solid #f1f5f9"
        }}>
          <div style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
            marginBottom: 4
          }}>
            {progression.treatmentDuration}
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: 1
          }}>
            Duration
          </div>
        </div>

        <div style={{
          textAlign: "center",
          padding: "12px",
          background: "#fafbfc",
          borderRadius: 12,
          border: "1px solid #f1f5f9"
        }}>
          <div style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
            marginBottom: 4
          }}>
            {progression.remedyChanges}
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: 1
          }}>
            Remedies Used
          </div>
        </div>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 16px",
        background: getTrendBg(progression.currentTrend),
        borderRadius: 12,
        border: `1px solid ${progression.currentTrend === "Improving" ? "#bbf7d0" : progression.currentTrend === "Worsening" ? "#fecaca" : "#e5e7eb"}`
      }}>
        {getTrendIcon(progression.currentTrend)}
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: getTrendColor(progression.currentTrend)
        }}>
          Current Trend: {progression.currentTrend}
        </span>
      </div>
    </div>
  );
}
