import React, { useEffect, useRef, useState } from "react";
import { Clock, Menu, Search, X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import ClinicBadge from "../shared/ClinicBadge";

interface TopBarProps {
  onPatientSelect: (patientId: string) => void;
  isMobile?: boolean;
  mobileNavOpen?: boolean;
  onToggleMobileNav: () => void;
  onOpenDiagnostics?: () => void;
}

export default function TopBar({
  onPatientSelect,
  isMobile = false,
  mobileNavOpen = false,
  onToggleMobileNav,
  onOpenDiagnostics,
}: TopBarProps) {
  const activeClinic = useUIStore((s) => s.activeClinic);
  const draftStatus = useUIStore((s) => s.draftStatus);
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const [currentTime, setCurrentTime] = useState(new Date());
  const devTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clinicColor = activeClinic === "Dabholi" ? "#0D7377" : "#6B3FA0";

  return (
    <>
      <div className="sakhi-topbar-stripe" style={{ background: clinicColor }} />

      <div
        className="sakhi-topbar"
        style={{
          paddingLeft: isMobile ? "var(--space-3)" : "var(--space-4)",
          paddingRight: isMobile ? "var(--space-3)" : "var(--space-4)",
          gap: isMobile ? "var(--space-3)" : "var(--space-4)",
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        {isMobile && (
          <button
            onClick={onToggleMobileNav}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            className="sakhi-icon-btn sakhi-tap sakhi-focus-ring sakhi-ripple"
            style={{ background: "var(--surface-muted)" }}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <div className="sakhi-row" style={{ gap: "var(--space-2)", minWidth: "fit-content" }}>
          <div
            className="sakhi-appmark sakhi-tap sakhi-focus-ring sakhi-ripple"
            style={{ background: clinicColor, cursor: "pointer" }}
            role="button"
            tabIndex={0}
            aria-label="Sakhi diagnostics trigger"
            title="Tap 7x for diagnostics"
            onClick={() => {
              const now = Date.now();
              const prev = devTapRef.current;
              const withinWindow = now - prev.lastAt < 1200;
              const nextCount = withinWindow ? prev.count + 1 : 1;
              devTapRef.current = { count: nextCount, lastAt: now };
              if (nextCount >= 7) {
                devTapRef.current = { count: 0, lastAt: 0 };
                onOpenDiagnostics?.();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget as any).click();
              }
            }}
          >
            ⚕️
          </div>
          <span className="sakhi-title">Sakhi</span>
        </div>

        <div className="sakhi-divider" />

        {!isMobile && <ClinicBadge />}

        {!isMobile && (
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            className="sakhi-tap sakhi-focus-ring sakhi-ripple"
            aria-label="Open search (Ctrl or Command plus K)"
          >
            <div className="sakhi-search-pill">
              <Search size={16} color="#94a3b8" />
              <span style={{ flex: 1, textAlign: "left", color: "#475569" }}>
                Search patients, queue…
              </span>
              <span className="sakhi-kbd-hint">Ctrl K</span>
            </div>
          </button>
        )}

        <div style={{ flex: 1 }} />

        {isMobile && (
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            aria-label="Search"
            data-testid="topbar-search-button"
            className="sakhi-icon-btn sakhi-tap sakhi-focus-ring sakhi-ripple"
            style={{ boxShadow: "0 1px 0 rgba(15, 23, 42, 0.03) inset" }}
          >
            <Search size={18} />
          </button>
        )}

        <div className="sakhi-row" style={{ minWidth: "fit-content" }}>
          <Clock size={16} color="#94a3b8" />
          <span className="sakhi-caption" style={{ color: "#475569" }}>
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        {!isMobile && draftStatus && (
          <div
            style={{
              padding: "var(--space-1) var(--space-2)",
              borderRadius: "999px",
              background: draftStatus === "Restored Draft" ? "#dcfce7" : "#fef3c7",
              color: draftStatus === "Restored Draft" ? "#166534" : "#b45309",
              fontSize: "var(--type-caption)",
              fontWeight: 800,
              minWidth: "fit-content",
              border: "1px solid var(--border)",
            }}
          >
            {draftStatus}
          </div>
        )}
      </div>

      <div className="sakhi-topbar-spacer" />
    </>
  );
}
