import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { usePatientStore } from "./store/usePatientStore";
import { initSyncService, notifyHydrationComplete, requestQueueSnapshot } from "./services/syncService";
import { registerSW } from 'virtual:pwa-register';

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Deterministic hydration: load patients from Dexie (canonical DB)
// before rendering the full app. Render a minimal loading shell while
// hydration completes. This reduces UI divergence between IndexedDB
// and transient Zustand state during startup.
(async function init() {
  root.render(
    <React.StrictMode>
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: '#64748b' }}>Loading application...</div>
      </div>
    </React.StrictMode>
  );

  try {
    initSyncService();
    await usePatientStore.getState().loadPatients();
    notifyHydrationComplete();
    requestQueueSnapshot();
  } catch (err) {
    console.error('[main] Patient hydration failed:', err);
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Register service worker and surface update/offline lifecycle events
  try {
    if ('serviceWorker' in navigator) {
      registerSW({
        onNeedRefresh() {
          window.dispatchEvent(new CustomEvent('sw:need-refresh'));
        },
        onOffline() {
          window.dispatchEvent(new CustomEvent('sw:offline'));
        },
      });
    }
  } catch (err) {
    console.warn('[main] SW registration failed', err);
  }
})();