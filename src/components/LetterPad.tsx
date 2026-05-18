// components/LetterPad.tsx
import React from "react";

interface Props {
  patient: any;
  consultation: any;
}

export default function LetterPad({ patient, consultation }: Props) {
  const consultationDate = consultation?.date
    ? new Date(consultation.date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "N/A";

  return (
    <div
      className="print-only"
      style={{
        padding: 32,
        fontFamily: "'Lora', serif",
        lineHeight: 1.8,
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: 32, fontSize: 18 }}>
        MEDICAL CERTIFICATE
      </h2>

      <p style={{ marginBottom: 16 }}>
        This is to certify that <strong>{patient?.name || "N/A"}</strong>, aged{" "}
        <strong>{patient?.age || "N/A"}</strong> years, was examined on{" "}
        <strong>{consultationDate}</strong>.
      </p>

      <p style={{ marginBottom: 16 }}>
        <strong>Chief Complaint:</strong> {consultation?.chiefComplaint || "N/A"}
      </p>

      {consultation?.caseText && (
        <p style={{ marginBottom: 16 }}>
          <strong>Clinical Notes:</strong> {consultation.caseText}
        </p>
      )}

      <p style={{ marginBottom: 32 }}>
        The patient is advised rest for <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>{" "}
        days and to follow prescribed treatment.
      </p>

      <div style={{ marginTop: 48 }}>
        <p style={{ marginBottom: 4 }}>
          <strong>Doctor:</strong> _____________________
        </p>
        <p style={{ marginBottom: 4 }}>Date: _____________________</p>
        <p>Signature: _____________________</p>
      </div>
    </div>
  );
}