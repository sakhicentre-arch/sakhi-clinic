/**
 * PrescriptionPrint.tsx
 * Sakhi Clinic — Master Prescription Print (V8.1)
 * Fixes: single-page output, no repeat, proper A4 isolation,
 *        one-time print trigger via useEffect, no window.print loops
 */

import React, { useMemo, useEffect } from "react";
import { useConsultationStore } from "../store/useConsultationStore";
import { usePatientStore } from "../store/usePatientStore";
import type { Patient } from "../types/models";
import { useAppointmentStore } from "../store/useAppointmentStore";
import { generatePrescriptionPDF } from "../services/pdfService";
import { shareOnWhatsApp } from "../services/whatsappService";
import { generateClinicalSummary } from "../ai/clinicalSummaryEngine";

export default function PrescriptionPrint() {
  const consultations = useConsultationStore((s) => s.consultations);
  const patients = usePatientStore((s) => s.patients);
  const appointments = useAppointmentStore((s) => s.appointments);

  const lastConsultation = useMemo(() =>
    consultations.length > 0 ? consultations[consultations.length - 1] : null,
    [consultations]
  );

  const patient = useMemo(() => {
    if (!lastConsultation) return null;
    const found = patients.find((p) => String(p.id) === String(lastConsultation.patientId));
    return found ? (found as Patient) : null;
  }, [patients, lastConsultation]);

  const clinicLocation = useMemo(() => {
    const apt = appointments.find((a) => a.id === lastConsultation?.appointmentId);
    return apt?.clinic || "City Light Branch";
  }, [appointments, lastConsultation]);

  const p = useMemo(() => ({
    name: patient?.name || "Unknown Patient",
    age: patient?.age ? String(patient.age) : "N/A",
    gender: patient?.gender || "N/A",
    phone: patient?.phone || "N/A",
    address: patient?.address || "No Address Recorded",
    referredBy: patient?.referredBy || "Self-Referred",
  }), [patient]);

  const advice = useMemo(() => {
    if (!lastConsultation) return { diet: [], precautions: [], instructions: [], followUps: [] };
    const dietSet = new Set<string>();
    const precautionSet = new Set<string>();
    const instructionSet = new Set<string>();
    const followUpSet = new Set<string>();
    const meds = lastConsultation.medicines || [];
    meds.forEach((m: any) => {
      const pr = m.prescription || {};
      if (pr.dietAdvice) (pr.dietAdvice || []).forEach((d: string) => dietSet.add(d));
      if (pr.precautions) (pr.precautions || []).forEach((prec: string) => precautionSet.add(prec));
      if (pr.instructions) instructionSet.add(pr.instructions);
      if (pr.followUpDays) followUpSet.add(pr.followUpDays);
    });
    return {
      diet: Array.from(dietSet),
      precautions: Array.from(precautionSet),
      instructions: Array.from(instructionSet),
      followUps: Array.from(followUpSet),
    };
  }, [lastConsultation]);

  // ✅ Single one-time print trigger — fires only once when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (!lastConsultation) {
    return <div style={{ padding: "100px", textAlign: "center" }}>Syncing Clinical Data...</div>;
  }

  const clinicalSummary = generateClinicalSummary(lastConsultation);

  const MASTER_PAYLOAD = {
    clinicName: "Sakhi Homeopathic Clinic",
    doctorName: "Dr. Amisha (BHMS)",
    patient: p.name,
    bio: `${p.age}Y / ${p.gender}`,
    referredBy: p.referredBy,
    date: new Date(lastConsultation.date).toLocaleDateString(),
    totality: {
      complaint: lastConsultation.chiefComplaint || "-",
      miasm: lastConsultation.miasm || "Awaiting Analysis",
      thermal: lastConsultation.thermal || "N/A",
      mind: lastConsultation.mind || "-",
      observations: lastConsultation.caseText || "-",
    },
    medicines: lastConsultation.medicines || [],
    advice: [...advice.diet, ...advice.precautions, ...advice.instructions],
    followUp: `${advice.followUps.join("/") || "15"} Days`,
    summary: clinicalSummary,
  };

  return (
    <>
      <style>{printCSS}</style>
      <div className="rx-screen-wrapper">
        <div id="print-area" className="rx-page">

          {/* HEADER */}
          <div className="rx-header">
            <h1 className="rx-clinic-name">{MASTER_PAYLOAD.clinicName}</h1>
            <p className="rx-doctor">{MASTER_PAYLOAD.doctorName}</p>
          </div>

          {/* PATIENT INFO */}
          <div className="rx-patient-strip">
            <div>
              <p><b>PATIENT:</b> {MASTER_PAYLOAD.patient}</p>
              <p><b>BIO:</b> {MASTER_PAYLOAD.bio}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p><b>DATE:</b> {MASTER_PAYLOAD.date}</p>
              <p><b>REFERRED:</b> {MASTER_PAYLOAD.referredBy}</p>
            </div>
          </div>

          {/* CLINICAL TOTALITY */}
          <div className="rx-section">
            <h3 className="rx-section-title">Clinical Totality</h3>
            <div className="rx-totality-grid">
              <p><b>Complaint:</b> {MASTER_PAYLOAD.totality.complaint}</p>
              <p><b>Miasmatic Layer:</b> {MASTER_PAYLOAD.totality.miasm}</p>
              <p><b>Thermal State:</b> {MASTER_PAYLOAD.totality.thermal}</p>
              <p style={{ gridColumn: "span 2" }}><b>Observations:</b> {MASTER_PAYLOAD.totality.observations}</p>
            </div>
          </div>

          {/* RX TABLE */}
          <div className="rx-section">
            <h3 className="rx-section-title">Rx / Prescription</h3>
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Remedy &amp; Potency</th>
                  <th>Dosage</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {MASTER_PAYLOAD.medicines.map((m: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{m.name}</td>
                    <td>{m.dosage}</td>
                    <td>{m.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ADVICE & FOLLOW-UP */}
          <div className="rx-advice-grid">
            <div>
              <h3 className="rx-section-title">Diet &amp; Advice</h3>
              <ul className="rx-advice-list">
                {MASTER_PAYLOAD.advice.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
            <div className="rx-followup-box">
              <p className="rx-followup-label">NEXT FOLLOW-UP</p>
              <p className="rx-followup-value">{MASTER_PAYLOAD.followUp}</p>
            </div>
          </div>

          {/* AI INSIGHTS */}
          <div className="rx-insights">
            <h3 className="rx-section-title" style={{ border: "none" }}>AI Clinical Insights</h3>
            <p className="rx-insights-text">{MASTER_PAYLOAD.summary}</p>
          </div>

          {/* SIGNATURE */}
          <div className="rx-signature">
            <div className="rx-signature-block">
              <p>Authorized Signatory</p>
            </div>
          </div>

          {/* ACTION BUTTONS — hidden in print */}
          <div className="no-print rx-actions">
            <button
              className="rx-btn-dark"
              onClick={() => generatePrescriptionPDF(MASTER_PAYLOAD)}
            >
              Generate PDF
            </button>
            <button
              className="rx-btn-green"
              onClick={() => shareOnWhatsApp(MASTER_PAYLOAD)}
            >
              Send WhatsApp
            </button>
          </div>

        </div>
      </div>
    </>
  );
}

const printCSS = `
  /* ── Screen wrapper ── */
  .rx-screen-wrapper {
    background: #f8fafc;
    min-height: 100vh;
    padding: 20px 0;
  }

  /* ── Page card (screen only) ── */
  .rx-page {
    padding: 50px;
    max-width: 800px;
    margin: 0 auto;
    background: #ffffff;
    font-family: Inter, sans-serif;
    color: #0f172a;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
  }

  /* ── Header ── */
  .rx-header { text-align: center; border-bottom: 4px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
  .rx-clinic-name { margin: 0; font-size: 32px; color: #1e3a8a; font-weight: 900; }
  .rx-doctor { margin: 5px 0; font-weight: 700; color: #475569; }

  /* ── Patient strip ── */
  .rx-patient-strip {
    display: flex; justify-content: space-between;
    margin-bottom: 30px; background: #f8fafc;
    padding: 15px; border-radius: 12px; border: 1px solid #edf2f7; font-size: 14px;
  }
  .rx-patient-strip p { margin: 0 0 4px; }

  /* ── Sections ── */
  .rx-section { margin-bottom: 30px; }
  .rx-section-title {
    font-size: 13px; color: #2563eb; text-transform: uppercase; font-weight: 900;
    border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 15px;
  }
  .rx-totality-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
  .rx-totality-grid p { margin: 0; }

  /* ── Rx table ── */
  .rx-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .rx-table th { padding: 10px; border-bottom: 2px solid #e2e8f0; text-align: left; background: #f8fafc; }
  .rx-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; }

  /* ── Advice grid ── */
  .rx-advice-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 25px; margin-bottom: 30px; }
  .rx-advice-list { font-size: 12px; color: #4a5568; padding-left: 20px; margin: 0; }
  .rx-advice-list li { margin-bottom: 4px; }
  .rx-followup-box { background: #eff6ff; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #bfdbfe; }
  .rx-followup-label { margin: 0; font-size: 11px; color: #3b82f6; font-weight: 800; }
  .rx-followup-value { font-size: 22px; font-weight: 900; color: #1e40af; margin: 10px 0 0; }

  /* ── Insights ── */
  .rx-insights { margin-top: 30px; padding: 15px; border-left: 4px solid #e2e8f0; background: #fcfcfc; }
  .rx-insights-text { font-size: 12px; color: #718096; font-style: italic; margin: 0; }

  /* ── Signature ── */
  .rx-signature { margin-top: 50px; text-align: right; }
  .rx-signature-block { display: inline-block; border-top: 1px solid #0f172a; padding-top: 8px; width: 180px; text-align: center; }
  .rx-signature-block p { margin: 0; font-weight: 800; font-size: 14px; }

  /* ── Action buttons (screen only) ── */
  .rx-actions { margin-top: 40px; display: flex; gap: 15px; justify-content: center; }
  .rx-btn-dark { padding: 12px 25px; border-radius: 8px; background: #0f172a; color: #fff; cursor: pointer; border: none; font-weight: 800; }
  .rx-btn-green { padding: 12px 25px; border-radius: 8px; background: #128c7e; color: #fff; cursor: pointer; border: none; font-weight: 800; }

  /* ── PRINT RULES ── */
  @media print {
    /* Hide everything on the page */
    body * { visibility: hidden !important; }

    /* Show only the print area */
    #print-area, #print-area * { visibility: visible !important; }

    /* Position print area at top-left */
    #print-area {
      position: fixed;
      top: 0; left: 0;
      width: 100%;
      margin: 0;
      padding: 20px;
      border: none;
      box-shadow: none;
      background: white;
    }

    /* Hide buttons inside print area */
    .no-print { display: none !important; }

    /* A4 page settings — prevents multi-page repeat */
    @page {
      size: A4;
      margin: 10mm;
    }
  }
`;