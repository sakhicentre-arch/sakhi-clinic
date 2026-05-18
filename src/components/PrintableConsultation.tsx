/**
 * PrintableConsultation.tsx
 * Sakhi Clinic — Printable Consultation Record
 *
 * A clean, A4-optimized printable layout for consultation records.
 * Receives patient and consultation data, renders print-friendly output.
 */

import React from "react";

interface MedicineLite {
  name?: string;
  potency?: string;
  dosage?: string;
  duration?: string;
}

interface PatientLite {
  name?: string;
  age?: string | number;
  gender?: string;
  phone?: string;
}

interface ConsultationLite {
  date?: string;
  chiefComplaint?: string;
  caseText?: string;
  onset?: string;
  mind?: string;
  thermal?: string;
  appetite?: string;
  thirst?: string;
  sleep?: string;
  desire?: string;
  aversion?: string;
  miasm?: string;
  posture?: string;
  gesture?: string;
  behaviour?: string;
  communication?: string;
  urine?: string;
  stool?: string;
  perspiration?: string;
  sensation?: string;
  timeModal?: string;
  periodicity?: string;
  medicines?: MedicineLite[];
  followUpDate?: string;
}

interface PrintableConsultationProps {
  patient: PatientLite;
  consultation: ConsultationLite;
}

const PrintableConsultation: React.FC<PrintableConsultationProps> = ({
  patient,
  consultation,
}) => {
  if (!patient || !consultation) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        No data to print.
      </div>
    );
  }

  const formatDate = (isoString: string | undefined): string => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (isoString: string | undefined): string => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div style={containerStyle}>
      <style>{printStyles}</style>

      {/* ─────── HEADER ─────── */}
      <div style={headerStyle}>
        <div style={clinicNameStyle}>SAKHI HOMEOPATHIC CLINIC</div>
        <div style={clinicSubStyle}>Clinical Consultation Record</div>
        <div style={doctorStyle}>Dr. Sahil Jain, B.H.M.S., M.D.(Hom)</div>
      </div>

      <div style={dividerStyle} />

      {/* ─────── PATIENT SECTION ─────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>PATIENT INFORMATION</div>
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <div style={labelStyle}>Patient Name</div>
            <div style={valueStyle}>{patient?.name || "—"}</div>
          </div>
          <div style={fieldStyle}>
            <div style={labelStyle}>Age / Gender</div>
            <div style={valueStyle}>
              {patient?.age || "—"} Yrs / {patient?.gender || "—"}
            </div>
          </div>
          <div style={fieldStyle}>
            <div style={labelStyle}>Contact</div>
            <div style={valueStyle}>{patient?.phone || "—"}</div>
          </div>
          <div style={fieldStyle}>
            <div style={labelStyle}>Date of Consultation</div>
            <div style={valueStyle}>
              {formatDate(consultation?.date)} {formatTime(consultation?.date)}
            </div>
          </div>
        </div>
      </div>

      {/* ─────── CHIEF COMPLAINT & CASE HISTORY ─────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>CLINICAL PRESENTATION</div>

        {consultation?.chiefComplaint && (
          <div style={blockFieldStyle}>
            <div style={labelStyle}>Chief Complaint</div>
            <div style={blockValueStyle}>{consultation.chiefComplaint}</div>
          </div>
        )}

        {consultation?.caseText && (
          <div style={blockFieldStyle}>
            <div style={labelStyle}>Case History</div>
            <div style={blockValueStyle}>{consultation.caseText}</div>
          </div>
        )}

        {consultation?.onset && (
          <div style={blockFieldStyle}>
            <div style={labelStyle}>Onset / Causation</div>
            <div style={blockValueStyle}>{consultation.onset}</div>
          </div>
        )}
      </div>

      {/* ─────── MENTAL & CONSTITUTIONAL ─────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>MENTAL & CONSTITUTIONAL STATE</div>
        <div style={gridStyle}>
          {consultation?.mind && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Mind & Emotions</div>
              <div style={valueStyle}>{consultation.mind}</div>
            </div>
          )}
          {consultation?.thermal && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Thermal</div>
              <div style={valueStyle}>{consultation.thermal}</div>
            </div>
          )}
          {consultation?.appetite && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Appetite</div>
              <div style={valueStyle}>{consultation.appetite}</div>
            </div>
          )}
          {consultation?.thirst && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Thirst</div>
              <div style={valueStyle}>{consultation.thirst}</div>
            </div>
          )}
          {consultation?.sleep && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Sleep</div>
              <div style={valueStyle}>{consultation.sleep}</div>
            </div>
          )}
          {consultation?.desire && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Desires</div>
              <div style={valueStyle}>{consultation.desire}</div>
            </div>
          )}
          {consultation?.aversion && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Aversions</div>
              <div style={valueStyle}>{consultation.aversion}</div>
            </div>
          )}
          {consultation?.miasm && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Miasm</div>
              <div style={valueStyle}>{consultation.miasm}</div>
            </div>
          )}
        </div>
      </div>

      {/* ─────── PHYSICAL OBSERVATIONS ─────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>OBJECTIVE OBSERVATION</div>
        <div style={gridStyle}>
          {consultation?.posture && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Posture</div>
              <div style={valueStyle}>{consultation.posture}</div>
            </div>
          )}
          {consultation?.gesture && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Gesture</div>
              <div style={valueStyle}>{consultation.gesture}</div>
            </div>
          )}
          {consultation?.behaviour && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Behaviour</div>
              <div style={valueStyle}>{consultation.behaviour}</div>
            </div>
          )}
          {consultation?.communication && (
            <div style={fieldStyle}>
              <div style={labelStyle}>Speech</div>
              <div style={valueStyle}>{consultation.communication}</div>
            </div>
          )}
        </div>
      </div>

      {/* ─────── EXCRETIONS ─────── */}
      {(consultation?.urine ||
        consultation?.stool ||
        consultation?.perspiration) && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>EXCRETIONS & SECRETIONS</div>
          <div style={gridStyle}>
            {consultation?.urine && (
              <div style={fieldStyle}>
                <div style={labelStyle}>Urine</div>
                <div style={valueStyle}>{consultation.urine}</div>
              </div>
            )}
            {consultation?.stool && (
              <div style={fieldStyle}>
                <div style={labelStyle}>Stool</div>
                <div style={valueStyle}>{consultation.stool}</div>
              </div>
            )}
            {consultation?.perspiration && (
              <div style={fieldStyle}>
                <div style={labelStyle}>Perspiration</div>
                <div style={valueStyle}>{consultation.perspiration}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────── MODALITIES & GENERALS ─────── */}
      {(consultation?.sensation ||
        consultation?.timeModal ||
        consultation?.periodicity) && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>MODALITIES & DYNAMICS</div>
          <div style={gridStyle}>
            {consultation?.sensation && (
              <div style={fieldStyle}>
                <div style={labelStyle}>Sensation</div>
                <div style={valueStyle}>{consultation.sensation}</div>
              </div>
            )}
            {consultation?.timeModal && (
              <div style={fieldStyle}>
                <div style={labelStyle}>Time Modalities</div>
                <div style={valueStyle}>{consultation.timeModal}</div>
              </div>
            )}
            {consultation?.periodicity && (
              <div style={fieldStyle}>
                <div style={labelStyle}>Periodicity</div>
                <div style={valueStyle}>{consultation.periodicity}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────── PRESCRIPTION ─────── */}
      {consultation?.medicines && consultation.medicines.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>PRESCRIPTION</div>
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeaderStyle}>
                <th style={tableCellStyle}>Remedy</th>
                <th style={tableCellStyle}>Potency</th>
                <th style={tableCellStyle}>Dose</th>
                <th style={tableCellStyle}>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {consultation.medicines.map((med: MedicineLite, idx: number) => (
                <tr key={idx} style={tableRowStyle}>
                  <td style={tableCellStyle}>{med?.name || "—"}</td>
                  <td style={tableCellStyle}>{med?.potency || "—"}</td>
                  <td style={tableCellStyle}>{med?.dosage || "—"}</td>
                  <td style={tableCellStyle}>{med?.duration || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─────── FOLLOW-UP ─────── */}
      {consultation?.followUpDate && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>FOLLOW-UP</div>
          <div style={gridStyle}>
            <div style={fieldStyle}>
              <div style={labelStyle}>Next Appointment</div>
              <div style={valueStyle}>
                {formatDate(consultation.followUpDate)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────── FOOTER ─────── */}
      <div style={dividerStyle} />
      <div style={footerStyle}>
        <div style={footerTextStyle}>
          This record is confidential and intended for the patient's medical
          care only.
        </div>
        <div style={footerTextStyle}>
          Printed on {new Date().toLocaleDateString("en-IN")} at{" "}
          {new Date().toLocaleTimeString("en-IN")}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  fontFamily: "'Georgia', serif",
  color: "#000",
  background: "#fff",
  padding: "40px",
  lineHeight: "1.6",
  maxWidth: "210mm",
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "32px",
};

const clinicNameStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#000",
  letterSpacing: "0.05em",
};

const clinicSubStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#333",
  marginTop: "4px",
  fontWeight: 600,
};

const doctorStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#555",
  marginTop: "8px",
};

const dividerStyle: React.CSSProperties = {
  height: "1px",
  background: "#000",
  margin: "20px 0",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "24px",
  pageBreakInside: "avoid",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#000",
  textTransform: "uppercase",
  borderBottom: "2px solid #000",
  paddingBottom: "8px",
  marginBottom: "16px",
  letterSpacing: "0.05em",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "16px",
};

const fieldStyle: React.CSSProperties = {
  marginBottom: "12px",
};

const blockFieldStyle: React.CSSProperties = {
  marginBottom: "16px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  color: "#333",
  textTransform: "uppercase",
  marginBottom: "4px",
  letterSpacing: "0.03em",
};

const valueStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#000",
  fontWeight: 500,
};

const blockValueStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#000",
  fontWeight: 500,
  background: "#f9f9f9",
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: "4px",
  lineHeight: "1.5",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "12px",
};

const tableHeaderStyle: React.CSSProperties = {
  background: "#f0f0f0",
  borderBottom: "2px solid #000",
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #ddd",
};

const tableCellStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: "11px",
  textAlign: "left",
  color: "#000",
};

const footerStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#666",
  textAlign: "center",
  marginTop: "32px",
  paddingTop: "16px",
  borderTop: "1px solid #ddd",
};

const footerTextStyle: React.CSSProperties = {
  marginBottom: "6px",
};

const printStyles = `
  @media print {
    body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    * {
      box-shadow: none !important;
      text-shadow: none !important;
    }
    a {
      text-decoration: underline;
    }
    @page {
      size: A4;
      margin: 10mm;
    }
  }
`;

export default PrintableConsultation;