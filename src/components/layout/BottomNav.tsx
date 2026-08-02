import React from 'react';
import { ActivePage, useUIStore } from '../../store/uiStore';

interface Props {
  onNavigate: (page: ActivePage) => void;
  isMobile?: boolean;
}

export default function BottomNav({ onNavigate, isMobile = false }: Props) {
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);

  if (!isMobile) {
    return null;
  }

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(56px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        zIndex: 60,
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-hidden={false}
    >
      <button data-testid="bottom-nav-today-button" onClick={() => onNavigate('today')} aria-label="Today" style={{ background: 'none', border: 'none' }}>Today</button>
      <button data-testid="bottom-nav-patients-button" onClick={() => onNavigate('patients')} aria-label="Patients" style={{ background: 'none', border: 'none' }}>Patients</button>
      <button data-testid="bottom-nav-consult-button" onClick={() => onNavigate('consultation')} aria-label="Consult" style={{ background: 'none', border: 'none' }}>Consult</button>
      <button data-testid="bottom-nav-appointments-button" onClick={() => onNavigate('appointments')} aria-label="Appointments" style={{ background: 'none', border: 'none' }}>Appt</button>
      {/* Mobile has no persistent search bar (GlobalSearch in TopBar.tsx is
          desktop-only) -- this is the doctor's only fast way to find a
          patient/queue entry/recent consultation by name on a phone. */}
      <button data-testid="bottom-nav-more-button" onClick={() => setGlobalSearchOpen(true)} aria-label="Search" style={{ background: 'none', border: 'none' }}>Search</button>
    </nav>
  );
}
