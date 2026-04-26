/**
 * ConsultationPage.tsx
 * Sakhi Clinic — Professional Clinical Decision Support System
 * * Version: 12.3 (Production Release — Hardened & Verified)
 * Features: Full V42 Schema, AI Signal Tiering, Uniform UUIDs, Google Review 2.0.
 */

import React, {
  useCallback,
  useEffect,
  useReducer,
  useMemo,
} from "react";
import { 
  Consultation, 
  Patient, 
  Medicine, 
  ConsultationOutcome, 
  normalizeOutcome 
} from "../services/db";
import {
  getConsultationsByPatient,
  saveConsultation,
} from "../services/consultationService";
import { getPatientById } from "../services/patientService";

// ✅ MAINTAINED FIX: Default Import for module stability
import PrescriptionEditor from "../components/PrescriptionEditor";

import { getLearnedSuggestions } from "../services/learningEngine";
import { 
  generateWhatsAppLink, 
  getPrescriptionMessage 
} from "../utils/whatsapp";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsultationPageProps {
  patientId: string;
  patientName?: string;
  onFinish?: () => void;
  appointmentId?: string;
}

interface FormData extends Omit<Consultation, 'id' | 'patientId'> {
  formDate: string; 
  formFollowUpDate: string;
}

const EMPTY_FORM: FormData = {
  formDate: new Date().toISOString().slice(0, 16),
  clinicId: "Dabholi",
  outcome: ConsultationOutcome.NO_CHANGE,
  chiefComplaint: "",
  caseText: "",
  mind: "",
  generals: "",
  appetite: "",
  thirst: "",
  sleep: "",
  thermal: "",
  desire: "",
  aversion: "",
  dream: "",
  physicalObservation: "",
  behaviour: "",
  communication: "",
  posture: "",
  gesture: "",
  sensation: "",
  onset: "",
  timeModal: "",
  periodicity: "",
  miasm: "",
  caseType: "chronic",
  medicines: [],
  formFollowUpDate: "",
  fee: 0,
};

interface PageState {
  consultations: Consultation[];
  loading: boolean;
  saving: boolean;
  editingId: string | null;
  formData: FormData;
  patient: Patient | null;
  learnedPatterns: any[]; 
}

type PageAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; payload: { consultations: Consultation[]; patient: Patient | null } }
  | { type: "SAVE_START" }
  | { type: "SAVE_DONE" }
  | { type: "EDIT_START"; payload: Consultation }
  | { type: "PATCH_FORM"; payload: Partial<FormData> }
  | { type: "SET_LEARNED"; payload: any[] };

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case "LOAD_START": return { ...state, loading: true };
    case "LOAD_SUCCESS": return { ...state, loading: false, consultations: action.payload.consultations, patient: action.payload.patient };
    case "SAVE_START": return { ...state, saving: true };
    case "SAVE_DONE": return { ...state, saving: false, editingId: null, formData: EMPTY_FORM };
    case "EDIT_START": return { ...state, editingId: action.payload.id, formData: consultationToForm(action.payload) };
    case "PATCH_FORM": return { ...state, formData: { ...state.formData, ...action.payload } };
    case "SET_LEARNED": return { ...state, learnedPatterns: action.payload };
    default: return state;
  }
}

function consultationToForm(c: Consultation): FormData {
  return {
    ...c,
    formDate: c.date ? c.date.slice(0, 16) : "",
    formFollowUpDate: c.followUpDate ? c.followUpDate.slice(0, 16) : "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS (PRODUCTION GRADE REVIEW LOGIC)
// ─────────────────────────────────────────────────────────────────────────────

const getImprovementFromOutcome = (outcome: ConsultationOutcome): string => {
  switch (outcome) {
    case ConsultationOutcome.IMPROVED: return "70%";
    case ConsultationOutcome.NO_CHANGE: return "30%";
    case ConsultationOutcome.WORSENED: return "10%";
    default: return "";
  }
};

const generateReviewTexts = (complaint: string, onset: string, outcome: ConsultationOutcome) => {
  const trimmedComplaint = complaint.length > 80 ? complaint.substring(0, 77) + "..." : complaint;
  const duration = onset || "થોડા સમય";
  const improvement = getImprovementFromOutcome(outcome);

  const guj = outcome === ConsultationOutcome.FIRST_VISIT 
    ? `સખી હોમિયોપેથિક ક્લિનિકમાં મેં ${trimmedComplaint}ની સારવાર શરૂ કરી છે. ડૉક્ટરનું નિદાન ખૂબ જ સચોટ છે.`
    : `હું ${trimmedComplaint} ની સારવાર સખી ક્લિનિકમાં લઈ રહ્યો હતો અને ${duration} માં મને લગભગ ${improvement} રાહત મળી છે. ખુબ સરસ પરિણામ છે.`;

  const eng = outcome === ConsultationOutcome.FIRST_VISIT
    ? `I recently started treatment for ${trimmedComplaint} at Sakhi Homeopathic Clinic. The doctor is very professional and the diagnosis was thorough.`
    : `I highly recommend Sakhi Homeopathic Clinic. I visited for ${trimmedComplaint} and saw ${improvement} improvement within ${duration}. Very happy with the results.`;

  return { guj, eng };
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT LOGIC
// ─────────────────────────────────────────────────────────────────────────────

const ConsultationPage: React.FC<ConsultationPageProps> = ({ patientId, patientName, onFinish }) => {
  const [state, dispatch] = useReducer(pageReducer, {
    consultations: [],
    loading: false,
    saving: false,
    editingId: null,
    formData: EMPTY_FORM,
    patient: null,
    learnedPatterns: [],
  });

  const { consultations, loading, saving, editingId, formData, patient, learnedPatterns } = state;
  const isEditing = editingId !== null;

  const decisionRules = useMemo(() => {
    const last = consultations[0];
    const outcome = normalizeOutcome(last?.outcome);
    return { 
      canRepeat: !!last && outcome === ConsultationOutcome.IMPROVED && (last.medicines?.length || 0) > 0 
    };
  }, [consultations]);

  useEffect(() => {
    const fetchAI = async () => {
      const text = `${formData.chiefComplaint} ${formData.caseText} ${formData.mind}`;
      if (text.trim().length > 15) {
        const learned = await getLearnedSuggestions(text);
        dispatch({ type: "SET_LEARNED", payload: learned });
      }
    };
    const timer = setTimeout(fetchAI, 1000);
    return () => clearTimeout(timer);
  }, [formData.chiefComplaint, formData.caseText, formData.mind]);

  const loadData = useCallback(async () => {
    dispatch({ type: "LOAD_START" });
    const [recs, p] = await Promise.all([getConsultationsByPatient(patientId), getPatientById(patientId)]);
    dispatch({ type: "LOAD_SUCCESS", payload: { consultations: recs, patient: p || null } });
  }, [patientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!formData.chiefComplaint) return alert("Chief Complaint is required.");
    
    if (formData.medicines.length === 0 && formData.outcome !== ConsultationOutcome.FIRST_VISIT) {
        const confirmWait = window.confirm("No medicines prescribed. Save this session as 'Observation/Wait' mode?");
        if (!confirmWait) return;
    }

    dispatch({ type: "SAVE_START" });
    const session: Consultation = {
      ...formData,
      id: editingId || crypto.randomUUID(),
      patientId,
      date: new Date(formData.formDate).toISOString(),
      followUpDate: formData.formFollowUpDate ? new Date(formData.formFollowUpDate).toISOString() : undefined,
    };
    const ok = await saveConsultation(session);
    if (ok) {
      dispatch({ type: "SAVE_DONE" });
      loadData();
      if (onFinish) onFinish();
    }
  };

  const handleWhatsAppShare = () => {
    if (!patient?.phone) return alert("Patient phone number missing.");
    const msg = getPrescriptionMessage(patient.name, formData.medicines);
    const link = generateWhatsAppLink(patient.phone, msg);
    if (link) window.open(link, "_blank");
  };

  const handleAskReview = () => {
    const rawMobile = patient?.phone || (patient as any)?.mobile;
    const mobile = rawMobile?.replace(/\D/g, "");
    const name = patient?.name || "Patient";
    const complaint = formData.chiefComplaint;

    if (!mobile || mobile.length < 10) return alert("⚠️ Patient mobile number is missing or invalid.");
    if (!complaint) return alert("⚠️ Please enter Chief Complaint to generate a review.");

    const isSatisfied = window.confirm(`Is ${name} satisfied with the treatment? \n\nSend review request via WhatsApp?`);
    if (!isSatisfied) return;

    const { guj, eng } = generateReviewTexts(complaint, formData.onset, formData.outcome);
    
    const baseUrl = `${window.location.origin}/review`;
    const fullParams = `?g=${encodeURIComponent(guj)}&e=${encodeURIComponent(eng)}`;
    
    // Safety check for URL length (Browsers/WhatsApp might truncate very long URLs)
    const reviewLink = (baseUrl.length + fullParams.length > 1500) ? baseUrl : baseUrl + fullParams;

    const whatsappMessage = `Hello ${name},

Thank you for choosing Sakhi Homeopathic Clinic 🙏

We are glad to be part of your health journey. If you are happy with our service, please share your valuable experience here:

👉 ${reviewLink}

It takes just 10 seconds and helps us serve you better! 😊`;

    const finalUrl = `https://wa.me/91${mobile}?text=${encodeURIComponent(whatsappMessage)}`;
    
    window.open(finalUrl, "_blank");
    alert("✅ WhatsApp opened. Please ask the patient to click the link and post the review.");
  };

  const patch = (p: Partial<FormData>) => dispatch({ type: "PATCH_FORM", payload: p });

  if (loading) return <div style={fullMessageStyle}>Loading Clinical Timeline...</div>;

  return (
    <div style={containerStyle}>
      <style>{customCSS}</style>

      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>{patient?.name || patientName}</h1>
          <div style={metaGridStyle}>
            <span>{patient?.gender} · {patient?.age} Yrs</span>
            <span style={{ color: "#22c55e" }}>● {consultations.length} Previous Visits</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleAskReview} className="btn-review">⭐ Ask for Review</button>
          <button onClick={() => window.print()} className="btn-secondary">📄 Print Rx</button>
          <button onClick={handleWhatsAppShare} className="btn-whatsapp">📲 WhatsApp Summary</button>
        </div>
      </header>

      <div style={contentGridStyle}>
        <main style={formPanelStyle}>
          <div style={outcomeGridStyle}>
            {Object.values(ConsultationOutcome).map(o => (
              <button 
                key={o} 
                className={`btn-outcome ${formData.outcome === o ? 'active' : ''}`}
                onClick={() => patch({ outcome: o })}
              >
                {o}
              </button>
            ))}
          </div>

          <section className="form-group">
            <h3 className="group-title">1. Clinical Core & Mentals</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <Field label="Chief Complaint" required span>
                <textarea style={INPUT} rows={2} value={formData.chiefComplaint} onChange={e => patch({ chiefComplaint: e.target.value })} />
              </Field>
              <Field label="Mental & Emotional State" span>
                <textarea style={INPUT} rows={2} value={formData.mind} onChange={e => patch({ mind: e.target.value })} placeholder="Anxieties, fears, disposition..." />
              </Field>
              <Field label="Detailed Case History" span>
                <textarea style={INPUT} rows={3} value={formData.caseText} onChange={e => patch({ caseText: e.target.value })} placeholder="Full description of symptoms..." />
              </Field>
            </div>
          </section>

          <section className="form-group">
            <h3 className="group-title">2. Physical Generals & Constitutional</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Field label="Thermal"><input style={INPUT} value={formData.thermal} onChange={e => patch({ thermal: e.target.value })} placeholder="Chilly / Hot" /></Field>
              <Field label="Thirst"><input style={INPUT} value={formData.thirst} onChange={e => patch({ thirst: e.target.value })} /></Field>
              <Field label="Appetite"><input style={INPUT} value={formData.appetite} onChange={e => patch({ appetite: e.target.value })} /></Field>
              <Field label="Desires"><input style={INPUT} value={formData.desire} onChange={e => patch({ desire: e.target.value })} /></Field>
              <Field label="Aversions"><input style={INPUT} value={formData.aversion} onChange={e => patch({ aversion: e.target.value })} /></Field>
              <Field label="Sleep & Dreams"><input style={INPUT} value={formData.sleep} onChange={e => patch({ sleep: e.target.value })} /></Field>
              <Field label="Miasm"><input style={INPUT} value={formData.miasm} onChange={e => patch({ miasm: e.target.value })} /></Field>
              <Field label="Case Type">
                <select style={INPUT} value={formData.caseType} onChange={e => patch({ caseType: e.target.value as any })}>
                  <option value="chronic">Chronic Case</option>
                  <option value="acute">Acute / Crisis</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="form-group">
            <h3 className="group-title">3. Modalities & Dynamics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Field label="Sensation"><input style={INPUT} value={formData.sensation} onChange={e => patch({ sensation: e.target.value })} /></Field>
              <Field label="Time Modalities"><input style={INPUT} value={formData.timeModal} onChange={e => patch({ timeModal: e.target.value })} /></Field>
              <Field label="Onset / Causation"><input style={INPUT} value={formData.onset} onChange={e => patch({ onset: e.target.value })} /></Field>
              <Field label="Periodicity"><input style={INPUT} value={formData.periodicity} onChange={e => patch({ periodicity: e.target.value })} /></Field>
            </div>
          </section>

          <section className="form-group">
            <h3 className="group-title">4. Objective Observation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <Field label="Posture"><input style={INPUT} value={formData.posture} onChange={e => patch({ posture: e.target.value })} /></Field>
              <Field label="Gesture"><input style={INPUT} value={formData.gesture} onChange={e => patch({ gesture: e.target.value })} /></Field>
              <Field label="Behaviour"><input style={INPUT} value={formData.behaviour} onChange={e => patch({ behaviour: e.target.value })} /></Field>
              <Field label="Speech"><input style={INPUT} value={formData.communication} onChange={e => patch({ communication: e.target.value })} /></Field>
            </div>
          </section>

          <section className="form-group" style={{ background: '#f8fafc', padding: 24, borderRadius: 16, border: '1.5px solid #e2e8f0' }}>
            <h3 className="group-title">5. Clinical Decision & Rx</h3>
            
            <div style={decisionGridStyle}>
              <button 
                disabled={!decisionRules.canRepeat}
                onClick={() => patch({ medicines: consultations[0].medicines })}
                className={`btn-decision ${!decisionRules.canRepeat ? 'disabled' : ''}`}
              >
                🔁 Repeat Last Selection
              </button>
              <button onClick={() => patch({ medicines: [] })} className="btn-decision">🔄 Change Remedy</button>
              <button onClick={() => patch({ medicines: [] })} className="btn-decision">⏸ Wait / Placebo</button>
            </div>

            <div style={{ marginTop: 24 }}>
              <PrescriptionEditor value={formData.medicines} onChange={meds => patch({ medicines: meds })} />
            </div>
          </section>

          <footer style={formFooterStyle}>
             <div style={{ width: 250 }}>
                <Field label="Next Follow-up"><input type="datetime-local" style={INPUT} value={formData.formFollowUpDate} onChange={e => patch({ formFollowUpDate: e.target.value })} /></Field>
             </div>
             <button onClick={handleSave} disabled={saving} className="btn-primary">
               {saving ? "Finalizing Transaction..." : isEditing ? "Update Clinical Record" : "Save & Finalize Session"}
             </button>
          </footer>
        </main>

        <aside style={sidebarStyle}>
          <div className="card intel-card">
            <div style={cardHeaderStyle}>🧠 AI Pattern Insights</div>
            {learnedPatterns.length === 0 ? (
              <p style={emptyTextStyle}>Analyzing case tokens for patterns...</p>
            ) : learnedPatterns.map((lp, idx) => {
              const confidence = lp.confidence || 0;
              let badgeColor = "#64748b"; 
              let badgeText = "Weak Signal";
              
              if (confidence > 0.75) { badgeColor = "#10b981"; badgeText = "Strong Match"; }
              else if (confidence > 0.60) { badgeColor = "#3b82f6"; badgeText = "Good Correlation"; }

              return (
                <div key={idx} style={patternRowStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#1e3a8a' }}>{lp.remedy}</div>
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#fff', background: badgeColor, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{badgeText}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginTop: 4 }}>Confidence Index: {Math.round(confidence * 100)}%</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Matched {lp.matches} clinical tokens</div>
                </div>
              );
            })}
          </div>

          <div className="card history-card">
            <div style={cardHeaderStyle}>📜 Timeline Snapshot</div>
            {consultations.slice(0, 4).map(c => (
              <div key={c.id} style={historyRowStyle}>
                <div style={{ fontWeight: 700 }}>{new Date(c.date).toLocaleDateString("en-IN")}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{c.outcome} · {c.medicines[0]?.name || "Observation"}</div>
              </div>
            ))}
            {consultations.length === 0 && <p style={emptyTextStyle}>First visit for this patient.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; span?: boolean; required?: boolean; children: React.ReactNode }> = ({ label, span, required, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span ? "1 / -1" : undefined }}>
    <label style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: '0.05em' }}>
      {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
    {children}
  </div>
);

const containerStyle: React.CSSProperties = { background: "#f8fafc", minHeight: "100vh", padding: "32px 40px", fontFamily: "'Lora', serif" };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 32, fontWeight: 800, color: '#0f172a' };
const metaGridStyle: React.CSSProperties = { display: 'flex', gap: 16, marginTop: 8, fontSize: 13, fontWeight: 600, color: '#64748b' };
const contentGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'start' };
const formPanelStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, padding: 36, border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.04)" };
const outcomeGridStyle: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 36, flexWrap: 'wrap' };
const decisionGridStyle: React.CSSProperties = { display: 'flex', gap: 12 };
const formFooterStyle: React.CSSProperties = { marginTop: 48, paddingTop: 32, borderTop: '2px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' };
const sidebarStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24 };
const cardHeaderStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: 16, letterSpacing: '0.05em' };
const patternRowStyle: React.CSSProperties = { marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #e2e8f0' };
const historyRowStyle: React.CSSProperties = { padding: '10px 0', borderBottom: '1px solid #f1f5f9' };
const emptyTextStyle: React.CSSProperties = { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' };
const fullMessageStyle: React.CSSProperties = { padding: 100, textAlign: 'center', fontSize: 18, color: '#64748b', fontWeight: 600 };

const INPUT: React.CSSProperties = { 
  width: "100%", padding: "12px 16px", fontSize: 14, background: "#f8fafc", 
  border: "1.5px solid #e2e8f0", borderRadius: 12, boxSizing: "border-box", outline: 'none'
};

const customCSS = `
  .form-group { margin-bottom: 42px; }
  .group-title { font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 24px; border-left: 4px solid #2d6a4f; padding-left: 12px; }
  .btn-outcome { padding: 10px 18px; border-radius: 12px; border: 2px solid #f1f5f9; background: #fff; cursor: pointer; font-weight: 700; font-size: 12px; color: #64748b; transition: 0.2s; }
  .btn-outcome.active { background: #2d6a4f; color: #fff; border-color: #2d6a4f; box-shadow: 0 4px 10px rgba(45,106,79,0.2); }
  .btn-decision { flex: 1; padding: 16px; border-radius: 14px; border: 2.5px solid #f1f5f9; background: #fff; cursor: pointer; font-weight: 800; font-size: 12px; color: #475569; transition: 0.2s; }
  .btn-decision:hover { border-color: #2d6a4f; color: #2d6a4f; background: #f0fdf4; }
  .btn-decision.disabled { opacity: 0.3; cursor: not-allowed; pointer-events: none; }
  .btn-primary { background: #0f172a; color: #fff; border: none; padding: 18px 40px; border-radius: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 10px 20px rgba(15,23,42,0.15); transition: 0.2s; }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(15,23,42,0.2); }
  .btn-whatsapp { background: #22c55e; color: #fff; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; }
  .btn-secondary { background: #fff; color: #0f172a; border: 1.5px solid #e2e8f0; padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; }
  .btn-review { background: #f59e0b; color: #fff; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
  .btn-review:hover { background: #d97706; transform: translateY(-1px); }
  .card { background: #fff; border: 1px solid #e2e8f0; padding: 24px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); }
  .intel-card { background: linear-gradient(180deg, #eff6ff 0%, #fff 100%); border-color: #bfdbfe; }
`;

export default ConsultationPage;