import React, { useState } from "react";

export interface OriginMismatchBannerProps {
  currentOrigin: string;
  recordedOrigin: string;
  onAcknowledge: () => void | Promise<void>;
}

/**
 * Module A — non-blocking warning shown when the app's browser origin no
 * longer matches the one recorded at first run. Detection only: it never
 * prevents the doctor from using the app, since the data on this origin (if
 * any) is still fully usable — it is a signal that a DIFFERENT origin's data
 * may now be unreachable, not that this origin's data is broken.
 */
const OriginMismatchBanner: React.FC<OriginMismatchBannerProps> = ({
  currentOrigin,
  recordedOrigin,
  onAcknowledge,
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  if (dismissed) return null;

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await onAcknowledge();
    } finally {
      setAcknowledging(false);
      setDismissed(true);
    }
  };

  return (
    <div
      role="alert"
      style={{
        background: "#fef3c7",
        borderBottom: "1px solid #fde68a",
        color: "#92400e",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ flex: "1 1 320px" }}>
        ⚠️ This app is running at a different address than when it was first set up
        ({recordedOrigin} → {currentOrigin}). If this is unexpected, patient data saved
        under the previous address may not be visible here. If you know this change is
        expected (e.g. a planned update), you can dismiss this.
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={acknowledging}
          style={{
            background: "#92400e",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            fontWeight: 700,
            fontSize: 12,
            cursor: acknowledging ? "default" : "pointer",
            opacity: acknowledging ? 0.6 : 1,
          }}
        >
          {acknowledging ? "Updating…" : "Acknowledge & update"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent",
            border: "1px solid #92400e",
            color: "#92400e",
            borderRadius: 6,
            padding: "6px 12px",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default OriginMismatchBanner;
