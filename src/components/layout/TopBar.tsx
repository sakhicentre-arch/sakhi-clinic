import React, { useState, useEffect } from "react";
import { useUIStore } from "../../store/uiStore";
import GlobalSearch from "../shared/GlobalSearch";
import ClinicBadge from "../shared/ClinicBadge";
import { Clock } from "lucide-react";

interface TopBarProps {
  onPatientSelect: (patientId: string) => void;
}

export default function TopBar({ onPatientSelect }: TopBarProps) {
  const activeClinic = useUIStore((s) => s.activeClinic);
  const draftStatus = useUIStore((s) => s.draftStatus);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clinicColor = activeClinic === "Dabholi" ? "#0D7377" : "#6B3FA0";

  return (
    <>
      {/* 3px Clinic Color Stripe */}
      <div
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          height: "3px",
          background: clinicColor,
          zIndex: 1001,
        }}
      />

      {/* Top Bar */}
      <div
        style={{
          position: "fixed",
          top: "3px",
          left: "0",
          right: "0",
          height: "56px",
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          paddingLeft: "24px",
          paddingRight: "24px",
          gap: "24px",
          zIndex: 1000,
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        {/* Sakhi Logo */}
        <div
          style={{
            fontSize: "18px",
            fontWeight: "900",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: "fit-content",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: clinicColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "16px",
              fontWeight: "900",
            }}
          >
            ⚕️
          </div>
          Sakhi
        </div>

        {/* Divider */}
        <div
          style={{
            width: "1px",
            height: "32px",
            background: "#e2e8f0",
          }}
        />

        {/* ClinicBadge */}
        <ClinicBadge />

        {/* Global Search */}
        <GlobalSearch onSelectPatient={onPatientSelect} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Live Clock */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            color: "#475569",
            fontWeight: "600",
            minWidth: "fit-content",
          }}
        >
          <Clock size={16} color="#94a3b8" />
          {currentTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>

        {/* Draft Status Badge */}
        {draftStatus && (
          <div
            style={{
              padding: "6px 12px",
              borderRadius: "999px",
              background: draftStatus === "Restored Draft" ? "#dcfce7" : "#fef3c7",
              color: draftStatus === "Restored Draft" ? "#166534" : "#b45309",
              fontSize: "12px",
              fontWeight: "700",
              minWidth: "fit-content",
            }}
          >
            {draftStatus}
          </div>
        )}
      </div>

      {/* Spacer to prevent content from going under TopBar */}
      <div style={{ height: "59px" }} />
    </>
  );
}
