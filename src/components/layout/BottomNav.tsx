import React from 'react';
import { ActivePage } from '../../store/uiStore';

interface Props {
  onNavigate: (page: ActivePage) => void;
  isMobile?: boolean;
  onOpenSearch?: () => void;
}

export default function BottomNav({ onNavigate, isMobile = false, onOpenSearch }: Props) {
  if (!isMobile) {
    return null;
  }

  const labels = ['Today', 'Patients', 'Consult', 'Appt', 'Search'];
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
      className="sakhi-overlay-enter"
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
        background: 'var(--surface, #ffffff)',
        borderTop: '1px solid var(--border, #e2e8f0)',
        zIndex: 1200,
        boxShadow: 'var(--shadow-2, 0 -10px 30px rgba(15, 23, 42, 0.10))',
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
          onClick={() => {
            if (index === 4) {
              onOpenSearch?.();
              return;
            }
            onNavigate(['today', 'patients', 'consultation', 'appointments', 'dashboard'][index] as ActivePage);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '16px 0',
            borderRadius: 20,
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
          className="sakhi-tap sakhi-focus-ring sakhi-ripple"
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
