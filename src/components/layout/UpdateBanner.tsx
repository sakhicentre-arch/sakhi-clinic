import React, { useEffect, useState } from "react";

declare const __APP_VERSION__: string;

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onNeed() {
      setVisible(true);
    }
    window.addEventListener("sw:need-refresh", onNeed as EventListener);
    return () => window.removeEventListener("sw:need-refresh", onNeed as EventListener);
  }, []);

  if (!visible) return null;

  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

  const doUpdate = () => {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "var(--space-2)",
        right: "var(--space-2)",
        bottom: 68,
        padding: "var(--space-2)",
        background: "#111827",
        color: "#fff",
        borderRadius: "var(--radius-2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 70,
      }}
      role="status"
    >
      <div className="sakhi-caption" style={{ color: "#fff" }}>
        Update available — v{version}
      </div>
      <div>
        <button
          onClick={() => setVisible(false)}
          className="sakhi-tap sakhi-focus-ring"
          style={{
            marginRight: "var(--space-2)",
            padding: "var(--space-1) var(--space-2)",
            borderRadius: 999,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Dismiss
        </button>
        <button
          onClick={doUpdate}
          className="sakhi-tap sakhi-focus-ring"
          style={{
            padding: "var(--space-1) var(--space-2)",
            borderRadius: 999,
            background: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#111827",
            fontWeight: 900,
          }}
        >
          Update
        </button>
      </div>
    </div>
  );
}

