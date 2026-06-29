import React, { useEffect, useState } from "react";
import TopBar from "./TopBar";
import LeftNav from "./LeftNav";
import { AppViewportFrame } from "./LayoutPrimitives";
import { ActivePage } from "../../store/uiStore";
import BottomNav from './BottomNav';
import UpdateBanner from './UpdateBanner';

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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
      <BottomNav onNavigate={handleNavigate} isMobile={isMobile} />
    </>
  );
}
