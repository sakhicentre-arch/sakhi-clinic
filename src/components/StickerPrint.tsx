/**
 * StickerPrint.tsx
 * Sakhi Clinic — Medicine Bottle Label
 * Size: 60mm × 35mm
 * Shows: Patient Name + Dosage Instructions ONLY
 * Print isolation: opens a dedicated popup window — does NOT interfere with Rx print
 */

import React from "react";

interface Props {
  patientName: string;
  dosageInstructions: string;
  onClose: () => void;
}

export default function StickerPrint({ patientName, dosageInstructions, onClose }: Props) {
  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }
    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Sticker</title>
    <style>
      @page { size: 60mm 35mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 60mm; height: 35mm;
        display: flex; align-items: center; justify-content: center;
        font-family: Arial, sans-serif;
        background: white;
      }
      .box {
        width: 60mm; height: 35mm;
        padding: 6px 8px;
        display: flex; flex-direction: column;
        justify-content: center; align-items: center;
        text-align: center;
        border: 1px dashed #555;
      }
      .name { font-weight: bold; font-size: 14px; margin-bottom: 5px; color: #000; word-break: break-word; line-height: 1.2; }
      .dosage { font-size: 11px; line-height: 1.4; color: #111; word-break: break-word; }
    </style>
  </head>
  <body>
    <div class="box">
      <div class="name">${patientName || "—"}</div>
      <div class="dosage">${
        dosageInstructions
          ? dosageInstructions.replace(/\n/g, "<br/>")
          : "As directed by physician"
      }</div>
    </div>
    <script>
      window.onload = function() {
        window.print();
        window.onafterprint = function() { window.close(); };
      };
    </script>
  </body>
</html>`);
    win.document.close();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>🏷️ Medicine Sticker Preview</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={previewWrapStyle}>
          <div style={stickerPreviewStyle}>
            <div style={namePreviewStyle}>{patientName || "—"}</div>
            <div style={dosagePreviewStyle}>
              {dosageInstructions
                ? dosageInstructions.split("\n").map((line, i) => (
                    <span key={i}>{line}{i < dosageInstructions.split("\n").length - 1 && <br />}</span>
                  ))
                : "As directed by physician"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textAlign: "center" }}>
          60mm × 35mm — Medicine Bottle Label
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={handlePrint} style={printBtnStyle}>🖨️ Print Sticker</button>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
};
const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 20, padding: 28,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 20, minWidth: 300,
};
const modalHeaderStyle: React.CSSProperties = {
  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8",
};
const previewWrapStyle: React.CSSProperties = {
  padding: 16, background: "#f1f5f9", borderRadius: 12,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const stickerPreviewStyle: React.CSSProperties = {
  width: "226px", height: "132px",
  padding: "6px 8px", fontFamily: "Arial, sans-serif",
  display: "flex", flexDirection: "column",
  justifyContent: "center", alignItems: "center",
  textAlign: "center", border: "1px dashed #94a3b8", background: "#fff",
  boxSizing: "border-box",
};
const namePreviewStyle: React.CSSProperties = {
  fontWeight: "bold", fontSize: 14, marginBottom: 5,
  color: "#000", wordBreak: "break-word", lineHeight: 1.2,
};
const dosagePreviewStyle: React.CSSProperties = {
  fontSize: 11, lineHeight: 1.4, color: "#111", wordBreak: "break-word",
};
const printBtnStyle: React.CSSProperties = {
  flex: 1, padding: "12px 0", background: "#0f172a", color: "#fff",
  border: "none", borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: "pointer",
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "12px 20px", background: "#f1f5f9", color: "#475569",
  border: "none", borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer",
};