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
      className="sakhi-bottom-nav sakhi-overlay-enter"
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
          className="sakhi-bottom-nav-btn sakhi-tap sakhi-focus-ring sakhi-ripple"
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
