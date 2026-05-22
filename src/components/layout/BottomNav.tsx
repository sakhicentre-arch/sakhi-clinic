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

  const labels = ['Today', 'Patients', 'Consult', 'Appt', 'More'];
  const testIds = [
    'bottom-nav-today-button',
    'bottom-nav-patients-button',
    'bottom-nav-consult-button',
    'bottom-nav-appointments-button',
    'bottom-nav-more-button',
  ];

  return (
    <nav
      data-testid="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100%',
        padding: '8px clamp(8px, 3vw, 16px) calc(env(safe-area-inset-bottom, 0px) + 8px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: '8px',
        alignItems: 'center',
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        zIndex: 1200,
        boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.08)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
      aria-label="Primary mobile navigation"
    >
      {labels.map((label, index) => (
        <button
          key={label}
          type="button"
          data-testid={testIds[index]}
          aria-label={label}
          onClick={() => onNavigate(['today', 'patients', 'consultation', 'appointments', 'dashboard'][index] as ActivePage)}
          style={{
            background: 'none',
            border: 'none',
            padding: '14px 0',
            borderRadius: 18,
            cursor: 'pointer',
            minWidth: 0,
            width: '100%',
            maxWidth: 120,
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#0f172a',
            backgroundColor: 'transparent',
            pointerEvents: 'auto',
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
