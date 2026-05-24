import React, { useEffect, useState } from "react";
import TopBar from "./TopBar";
import LeftNav from "./LeftNav";
import { AppViewportFrame } from "./LayoutPrimitives";
import { ActivePage } from "../../store/uiStore";
import BottomNav from './BottomNav';
import UpdateBanner from './UpdateBanner';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { useUIStore } from "../../store/uiStore";
import CommandPalette from "../commandPalette/CommandPalette";
import DiagnosticsPanel from "../debug/DiagnosticsPanel";

interface AppShellProps {
  children: React.ReactNode;
  onNavigate: (page: ActivePage) => void;
  onPatientSelect: (patientId: string) => void;
}

export default function AppShell({
  children,
  onNavigate,
  onPatientSelect,
}: AppShellProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const keyboard = useKeyboardInset();
  const globalSearchOpen = useUIStore((s) => s.globalSearchOpen);
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    // Some browser runtimes (and certain test harnesses) still expose the legacy MediaQueryList API.
    // Support both to keep mobile orchestration deterministic without changing UX logic.
    try {
      (mq as any).addEventListener?.("change", update);
      if (!(mq as any).addEventListener && (mq as any).addListener) (mq as any).addListener(update);
    } catch {
      // ignore
    }
    return () => {
      try {
        (mq as any).removeEventListener?.("change", update);
        if (!(mq as any).removeEventListener && (mq as any).removeListener) (mq as any).removeListener(update);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && globalSearchOpen) {
        e.preventDefault();
        setGlobalSearchOpen(false);
        return;
      }

      if (isTypingTarget(e.target)) return;

      const isK = e.key.toLowerCase() === "k";
      const isPaletteChord = isK && (e.ctrlKey || e.metaKey);
      const isSlash = e.key === "/";

      if (isPaletteChord || isSlash) {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [globalSearchOpen, setGlobalSearchOpen]);

  const handleNavigate = (page: ActivePage) => {
    setDrawerOpen(false);
    onNavigate(page);
  };

  return (
    <>
      <TopBar
        onPatientSelect={onPatientSelect}
        isMobile={isMobile}
        mobileNavOpen={drawerOpen}
        onToggleMobileNav={() => setDrawerOpen((prev) => !prev)}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
      />
      {!isMobile && <LeftNav onNavigate={handleNavigate} />}
      {isMobile && drawerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: '59px 0 0 0',
            background: 'rgba(15, 23, 42, 0.35)',
            zIndex: 900,
          }}
          onClick={() => setDrawerOpen(false)}
        />
      )}
      {isMobile && (
        <LeftNav
          onNavigate={handleNavigate}
          isMobile
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
      <UpdateBanner />
      <AppViewportFrame>{children}</AppViewportFrame>
      {isMobile && !keyboard.isOpen && (
        <BottomNav
          onNavigate={handleNavigate}
          isMobile={isMobile}
          onOpenSearch={() => setGlobalSearchOpen(true)}
        />
      )}
      <CommandPalette onNavigate={handleNavigate} onSelectPatient={onPatientSelect} />
      <DiagnosticsPanel open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
    </>
  );
}
