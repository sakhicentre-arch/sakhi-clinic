import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { usePatientStore } from "./store/usePatientStore";
import { initSyncService, notifyHydrationComplete, requestQueueSnapshot } from "./services/syncService";
import { registerSW } from 'virtual:pwa-register';
import { initAppLifecycleRuntime } from "./services/appLifecycleRuntimeService";
import { logOperationalEvent } from "./services/operationalEventLogService";
import { installGlobalErrorCapture } from "./services/runtimeErrorCaptureService";

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
    await logOperationalEvent({
      level: "info",
      type: "app.hydration.complete",
      message: "Initial hydration completed",
    });
  } catch (err) {
    console.error('[main] Patient hydration failed:', err);
    await logOperationalEvent({
      level: "error",
      type: "app.hydration.failure",
      message: "Initial hydration failed",
      data: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Global runtime error capture (production-safe, stored locally).
  try {
    installGlobalErrorCapture();
  } catch (err) {
    console.warn("[main] installGlobalErrorCapture failed", err);
  }

  // Operational runtime integration: non-blocking lifecycle orchestration.
  // Intentionally started after initial render to protect startup performance.
  try {
    window.setTimeout(() => initAppLifecycleRuntime(), 0);
  } catch (err) {
    console.warn("[main] initAppLifecycleRuntime failed", err);
  }

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
