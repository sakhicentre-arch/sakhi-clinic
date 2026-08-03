/**
 * PaymentScreenshotViewer.tsx
 * Sakhi Clinic — Payment proof-of-payment viewer.
 *
 * paymentScreenshotDataUrl already exists on Consultation (recorded via
 * paymentService.ts's compressPaymentScreenshot(), wired into the
 * consultation payment flow) but was never displayed anywhere after
 * capture -- this closes that gap. Modal convention mirrors
 * StickerPrint.tsx's overlay/modal pattern for consistency.
 */

import React from "react";
import { Download } from "lucide-react";

interface Props {
  dataUrl: string;
  patientName: string;
  date?: string;
  onClose: () => void;
}

export default function PaymentScreenshotViewer({ dataUrl, patientName, date, onClose }: Props) {
  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `payment-proof-${patientName.replace(/\s+/g, "-").toLowerCase()}${date ? `-${date}` : ""}.jpg`;
    link.click();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>Payment Proof — {patientName}</span>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>
        <div style={imageWrapStyle}>
          <img src={dataUrl} alt="Payment proof screenshot" style={imageStyle} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={handleDownload} style={downloadBtnStyle}>
            <Download size={14} /> Download
          </button>
          <button onClick={onClose} style={cancelBtnStyle}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16,
};
const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 20, padding: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  display: "flex", flexDirection: "column", gap: 14,
  maxWidth: "min(480px, 92vw)", maxHeight: "90vh",
};
const modalHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8",
};
const imageWrapStyle: React.CSSProperties = {
  overflow: "auto", borderRadius: 12, background: "#f1f5f9",
  display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120,
};
const imageStyle: React.CSSProperties = {
  maxWidth: "100%", maxHeight: "65vh", display: "block", borderRadius: 8,
};
const downloadBtnStyle: React.CSSProperties = {
  flex: 1, padding: "10px 0", background: "#0f172a", color: "#fff",
  border: "none", borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "10px 20px", background: "#f1f5f9", color: "#475569",
  border: "none", borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer",
};
