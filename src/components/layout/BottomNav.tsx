import React from 'react';
import { ActivePage, useUIStore } from '../../store/uiStore';

interface Props {
  onNavigate: (page: ActivePage) => void;
  isMobile?: boolean;
}

// 44x44 is the standard minimum mobile touch target (WCAG 2.5.5 / iOS HIG) --
// these buttons previously had no explicit sizing at all, rendering well
// under that (a real one-handed-tap usability defect, not cosmetic).
const navButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  flex: 1,
  minWidth: 44,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  cursor: 'pointer',
};

export default function BottomNav({ onNavigate, isMobile = false }: Props) {
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);

  if (!isMobile) {
    return null;
  }

  return (
    <nav
      data-testid="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        // max(...) guarantees real breathing room below the buttons on
        // devices that report no safe-area inset at all (most non-notched
        // Android phones, and every headless test browser) -- env() alone
        // silently resolves to 0px there, leaving the row flush against
        // the screen edge.
        height: 'calc(56px + max(8px, env(safe-area-inset-bottom)))',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
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
      <button data-testid="bottom-nav-today-button" onClick={() => onNavigate('today')} aria-label="Today" className="sakhi-tap sakhi-focus-ring" style={navButtonStyle}>Today</button>
      <button data-testid="bottom-nav-patients-button" onClick={() => onNavigate('patients')} aria-label="Patients" className="sakhi-tap sakhi-focus-ring" style={navButtonStyle}>Patients</button>
      <button data-testid="bottom-nav-consult-button" onClick={() => onNavigate('consultation')} aria-label="Consult" className="sakhi-tap sakhi-focus-ring" style={navButtonStyle}>Consult</button>
      <button data-testid="bottom-nav-appointments-button" onClick={() => onNavigate('appointments')} aria-label="Appointments" className="sakhi-tap sakhi-focus-ring" style={navButtonStyle}>Appt</button>
      {/* Mobile has no persistent search bar (GlobalSearch in TopBar.tsx is
          desktop-only) -- this is the doctor's only fast way to find a
          patient/queue entry/recent consultation by name on a phone. */}
      <button data-testid="bottom-nav-more-button" onClick={() => setGlobalSearchOpen(true)} aria-label="Search" className="sakhi-tap sakhi-focus-ring" style={navButtonStyle}>Search</button>
    </nav>
  );
}
