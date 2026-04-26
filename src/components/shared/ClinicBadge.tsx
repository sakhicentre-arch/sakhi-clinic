import React, { useState } from "react";
import { useUIStore } from "../../store/uiStore";
import { ChevronDown } from "lucide-react";

export default function ClinicBadge() {
  const activeClinic = useUIStore((s) => s.activeClinic);
  const setActiveClinic = useUIStore((s) => s.setActiveClinic);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const clinicColor =
    activeClinic === "Dabholi"
      ? "#0D7377" // Teal
      : "#6B3FA0"; // Plum

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          background: "#fff",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: "700",
          color: "#0f172a",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#fff";
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: clinicColor,
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
        {activeClinic}
        <ChevronDown size={14} color={clinicColor} />
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: "0",
            marginTop: "8px",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            zIndex: 100,
            minWidth: "180px",
          }}
        >
          {(["Dabholi", "City Light"] as const).map((clinic) => (
            <button
              key={clinic}
              onClick={() => {
                setActiveClinic(clinic);
                setDropdownOpen(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "none",
                background: activeClinic === clinic ? "#f0f9ff" : "transparent",
                borderBottom: clinic === "Dabholi" ? "1px solid #f1f5f9" : "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: "700",
                color: "#0f172a",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (activeClinic !== clinic) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc";
                }
              }}
              onMouseLeave={(e) => {
                if (activeClinic !== clinic) {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: clinic === "Dabholi" ? "#0D7377" : "#6B3FA0",
                  }}
                />
                {clinic}
                {activeClinic === clinic && (
                  <span style={{ marginLeft: "auto", fontSize: "12px", color: "#16a34a" }}>
                    ✓
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {dropdownOpen && (
        <div
          style={{
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            zIndex: 99,
          }}
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
}
