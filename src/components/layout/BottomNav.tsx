import React from 'react';
import { ActivePage } from '../../store/uiStore';

interface Props {
  onNavigate: (page: ActivePage) => void;
  isMobile?: boolean;
}

export default function BottomNav({ onNavigate, isMobile = false }: Props) {
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
      <button onClick={() => onNavigate('today')} aria-label="Today" style={{ background: 'none', border: 'none' }}>Today</button>
      <button onClick={() => onNavigate('patients')} aria-label="Patients" style={{ background: 'none', border: 'none' }}>Patients</button>
      <button onClick={() => onNavigate('consultation')} aria-label="Consult" style={{ background: 'none', border: 'none' }}>Consult</button>
      <button onClick={() => onNavigate('appointments')} aria-label="Appointments" style={{ background: 'none', border: 'none' }}>Appt</button>
      <button onClick={() => onNavigate('dashboard')} aria-label="More" style={{ background: 'none', border: 'none' }}>More</button>
    </nav>
  );
}
