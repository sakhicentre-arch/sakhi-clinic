import React, { useEffect, useState } from 'react';

declare const __APP_VERSION__: string;

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onNeed() {
      setVisible(true);
    }
    window.addEventListener('sw:need-refresh', onNeed as EventListener);
    return () => window.removeEventListener('sw:need-refresh', onNeed as EventListener);
  }, []);

  if (!visible) return null;

  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  const doUpdate = () => {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    } catch (err) {
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 68,
        padding: 10,
        background: '#111827',
        color: '#fff',
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 70,
      }}
      role="status"
    >
      <div style={{ fontSize: 13 }}>Update available — v{version}</div>
      <div>
        <button onClick={() => setVisible(false)} style={{ marginRight: 8 }}>Dismiss</button>
        <button onClick={doUpdate} style={{ fontWeight: 700 }}>Update</button>
      </div>
    </div>
  );
}
