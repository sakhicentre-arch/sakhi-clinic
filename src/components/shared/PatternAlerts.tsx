import React from "react";
import { PatternAlert } from "../../hooks/useClinicalInsights";

interface PatternAlertsProps {
  alerts: PatternAlert[];
}

export default function PatternAlerts({ alerts }: PatternAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {alerts.map((alert, index) => (
        <div
          key={index}
          style={{
            background: alert.severity === "danger" ? "#fef2f2" : "#fefce8",
            border: `1px solid ${alert.severity === "danger" ? "#fecaca" : "#fde047"}`,
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 12
          }}
        >
          <span style={{ fontSize: 18 }}>{alert.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: alert.severity === "danger" ? "#dc2626" : "#92400e"
            }}>
              Clinical Alert
            </div>
            <div style={{
              fontSize: 13,
              color: alert.severity === "danger" ? "#991b1b" : "#78350f",
              marginTop: 2
            }}>
              {alert.message}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
