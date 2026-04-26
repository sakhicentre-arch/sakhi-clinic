import React from "react";
interface DoctorAlert {
  type: "pendingPayment" | "missedFollowUp" | "stableCase" | "firstVisit";
  label: string;
  color: string;
  bg: string;
}

interface DoctorAlertBadgesProps {
  alerts: DoctorAlert[];
}

export default function DoctorAlertBadges({ alerts }: DoctorAlertBadgesProps) {
  if (alerts.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16
    }}>
      {alerts.map((alert, index) => (
        <div
          key={index}
          style={{
            background: alert.bg,
            color: alert.color,
            fontSize: 11,
            fontWeight: 900,
            padding: "4px 10px",
            borderRadius: 999,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            border: `1px solid ${alert.type === "missedFollowUp" ? "#fecaca" : alert.type === "pendingPayment" ? "#fed7aa" : "#e2e8f0"}`,
            display: "flex",
            alignItems: "center",
            gap: 4
          }}
        >
          {alert.type === "firstVisit" && "🆕"}
          {alert.type === "missedFollowUp" && "🔴"}
          {alert.type === "pendingPayment" && "💰"}
          {alert.type === "stableCase" && "🟢"}
          {alert.label}
        </div>
      ))}
    </div>
  );
}
