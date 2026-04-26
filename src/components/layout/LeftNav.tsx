import React, { useState } from "react";
import { useUIStore } from "../../store/uiStore";
import { useQueueStore } from "../../store/queueStore";
import {
  Calendar,
  Users,
  Clock,
  Stethoscope,
  TrendingUp,
  Settings,
  LayoutDashboard, // Added Dashboard icon
} from "lucide-react";
import { ActivePage } from "../../store/uiStore";

interface LeftNavProps {
  onNavigate: (page: ActivePage) => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, badge: false }, // Added Dashboard entry
  { id: "today", label: "Today", icon: Calendar, badge: true },
  { id: "patients", label: "Patients", icon: Users, badge: false },
  { id: "appointments", label: "Appointments", icon: Clock, badge: false },
  { id: "consultation", label: "Consultation", icon: Stethoscope, badge: false },
  { id: "revenue", label: "Revenue", icon: TrendingUp, badge: false },
];

export default function LeftNav({ onNavigate }: LeftNavProps) {
  const activePage = useUIStore((s) => s.activePage);
  const activeClinic = useUIStore((s) => s.activeClinic);
  const queue = useQueueStore((s) => s.queue);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const clinicColor = activeClinic === "Dabholi" ? "#0D7377" : "#6B3FA0";
  const waitingCount = queue.filter((e) => e.status === "waiting").length;

  return (
    <div
      style={{
        position: "fixed",
        left: "0",
        top: "59px",
        width: "64px",
        height: `calc(100vh - 59px)`,
        background: "#f8fafc",
        borderRight: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "20px",
        paddingBottom: "20px",
        zIndex: 500,
      }}
    >
      {/* Nav Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <div
              key={item.id}
              style={{
                position: "relative",
              }}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <button
                aria-label={item.label}
                onClick={() => onNavigate(item.id as ActivePage)}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  border: "none",
                  background: isActive ? clinicColor : "transparent",
                  color: isActive ? "#fff" : "#94a3b8",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                <Icon size={20} />

                {/* Left Bar Indicator */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: "-12px",
                      top: "0",
                      bottom: "0",
                      width: "3px",
                      background: clinicColor,
                      borderRadius: "0 3px 3px 0",
                    }}
                  />
                )}

                {/* Queue Badge */}
                {item.id === "today" && waitingCount > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: "#dc2626",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                      fontWeight: "700",
                      border: "2px solid #f8fafc",
                    }}
                  >
                    {waitingCount > 9 ? "9+" : waitingCount}
                  </div>
                )}

                {/* New Badge - Specific to Today page logic */}
                {item.id === "today" && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-6px",
                      left: "-6px",
                      fontSize: "8px",
                      fontWeight: "900",
                      background: "#ec4899",
                      color: "#fff",
                      padding: "2px 4px",
                      borderRadius: "4px",
                    }}
                  >
                    NEW
                  </div>
                )}
              </button>

              {/* Tooltip */}
              {hoveredItem === item.id && (
                <div
                  style={{
                    position: "absolute",
                    left: "56px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "#0f172a",
                    color: "#fff",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 1000,
                  }}
                >
                  {item.label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings */}
      <button
        aria-label="Settings"
        onClick={() => onNavigate("settings")}
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          border: "none",
          background: activePage === "settings" ? clinicColor : "transparent",
          color: activePage === "settings" ? "#fff" : "#94a3b8",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => setHoveredItem("settings")}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <Settings size={20} />

        {hoveredItem === "settings" && (
          <div
            style={{
              position: "absolute",
              left: "56px",
              background: "#0f172a",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "700",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            Settings
          </div>
        )}
      </button>
    </div>
  );
}