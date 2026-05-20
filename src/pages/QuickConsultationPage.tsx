// QuickConsultationPage.tsx
/**
 * QuickConsultationPage.tsx
 * Sakhi Clinic — Quick Mode Consultation
 * Streamlined UI — same props, same save logic, same services as ConsultationPage
 */

import React, {
  useCallback,
  useEffect,
  useReducer,
  useMemo,
  useState,
} from "react";
import {
  Consultation,
  Patient,
  Medicine,
  ConsultationOutcome,
  PaymentStatus,
  normalizeOutcome,
} from "../services/db";
import {
  getConsultationsByPatient,
  saveConsultation,
} from "../services/consultationService";
import { getPatientById } from "../services/patientService";
import PrescriptionEditor from "../components/PrescriptionEditor";
import SmartInput from "../components/SmartInput";
import DictationButton from "../components/DictationButton";
import StickerPrint from "../components/StickerPrint";
import { SUGGESTIONS } from "../data/clinicalSuggestions";
import { getLearnedSuggestions } from "../services/learningEngine";
import { generateWhatsAppLink, getPrescriptionMessage, normalizePatientPhone } from "../utils/whatsapp";
import { analyzeRemedies } from "../services/remedyEngine";
import PrintableConsultation from "../components/PrintableConsultation";
import { generateRemedyExplanations } from "../services/aiReasoningEngine";
import { usePatientStore } from "../store/usePatientStore";
import { useConsultationStore } from "../store/useConsultationStore";

export interface QuickConsultationPageProps {
  patientId: string;
  patientName?: string;
  onFinish?: () => void;
  appointmentId?: string;
  onSwitchMode: () => void;
}

interface FormData
  extends Partial
    Omit<Consultation, "id" | "patientId" | "date" | "followUpDate">
  > {
  formDate: string;
  formFollowUpDate: string;
  clinicId: Consultation["clinicId"];
  outcome: ConsultationOutcome;
  chiefComplaint: string;
  caseText: string;
  medicines: Medicine[];
  allergy?: string;
  familyHistory?: string;
  pastHistory?: string;
  surgicalHistory?: string;
  paymentStatus?: PaymentStatus;
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
  urine: "",
  stool: "",
  perspiration: "",
  sensation: "",
  onset: "",
  timeModal: "",
  periodicity: "",
  miasm: "",
  caseType: "chronic",
  medicines: [],
  formFollowUpDate: "",
  fee: 0,
  allergy: "",
  familyHistory: "",
  pastHistory: "",
  surgicalHistory: "",
  paymentStatus: "pending",
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
  | {
      type: "LOAD_SUCCESS";
      payload: { consultations: Consultation[]; patient: Patient | null };
    }
  | { type: "SAVE_START" }
  | { type: "SAVE_DONE" }
  | { type: "EDIT_START"; payload: Consultation }
  | { type: "PATCH_FORM"; payload: Partial<FormData> }
  | { type: "SET_LEARNED"; payload: any[] };

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, loading: true };
    case "LOAD_SUCCESS":
      return {
        ...state,
        loading: false,
        consultations: action.payload.consultations,
        patient: action.payload.patient,
      };
    case "SAVE_START":
      return { ...state, saving: true };
    case "SAVE_DONE":
      return { ...state, saving: false, editingId: null, formData: EMPTY_FORM };
    case "EDIT_START":
      return {
        ...state,
        editingId: action.payload.id,
        formData: consultationToForm(action.payload),
      };
    case "PATCH_FORM":
      return { ...state, formData: { ...state.formData, ...action.payload } };
    case "SET_LEARNED":
      return { ...state, learnedPatterns: action.payload };
    default:
      return state;
  }
}

function consultationToForm(c: Consultation): FormData {
  return {
    ...c,
    formDate: c.date ? c.date.slice(0, 16) : "",
    formFollowUpDate: c.followUpDate ? c.followUpDate.slice(0, 16) : "",
    allergy: (c as any).allergy || "",
    familyHistory: (c as any).familyHistory || "",
    pastHistory: (c as any).pastHistory || "",
    surgicalHistory: (c as any).surgicalHistory || "",
    paymentStatus: (c as any).paymentStatus || "pending",
  };
}

// ── Collapsible Panel ──────────────────────────────────────────────────────

const CollapsiblePanel: React.FC<{
  title: string;
  emoji?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, emoji = "", children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={collapsibleWrapStyle}>
      <button onClick={() => setOpen((v) => !v)} style={collapsibleHeaderStyle}>
        <span style={{ fontWeight: 800, fontSize: 13, color: "#1e293b" }}>
          {emoji} {title}
        </span>
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
          {open ? "▲ Hide" : "▼ Show"}
        </span>
      </button>
      {open && <div style={{ padding: "16px 0 4px" }}>{children}</div>}
    </div>
  );
};

const collapsibleWrapStyle: React.CSSProperties = {
  border: "1.5px solid #e2e8f0",
  borderRadius: 14,
  marginBottom: 16,
  background: "#fff",
  overflow: "hidden",
};
const collapsibleHeaderStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  background: "#f8fafc",
  border: "none",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

// ── Field ──────────────────────────────────────────────────────────────────

const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, required, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
    <label style={fieldLabelStyle}>
      {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
    </label>
    {children}
  </div>
);

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  fontSize: 14,
  background: "#f8fafc",
  border: "1.5px solid #e2e8f0",
  borderRadius: 10,
  boxSizing: "border-box",
  outline: "none",
};

// ── Main Component ─────────────────────────────────────────────────────────

const QuickConsultationPage: React.FC<QuickConsultationPageProps> = ({
  patientId,
  patientName,
  onFinish,
  onSwitchMode,
}) => {
  const [state, dispatch] = useReducer(pageReducer, {
    consultations: [],
    loading: false,
    saving: false,
    editingId: null,
    formData: EMPTY_FORM,
    patient: null,
    learnedPatterns: [],
  });

  const [showSticker, setShowSticker] = useState(false);
  const [showAI, setShowAI] = useState(false);

  const { consultations, loading, saving, editingId, formData, patient, learnedPatterns } = state;
  const isEditing = editingId !== null;
  const lang = (formData as any).language || "en-IN";

  const patch = (p: Partial<FormData>) =>
    dispatch({ type: "PATCH_FORM", payload: p });

  // ── Data loading (identical to ConsultationPage) ──
  const loadData = useCallback(async () => {
    dispatch({ type: "LOAD_START" });
    try {
      const [recs, p] = await Promise.all([
        getConsultationsByPatient(patientId),
        getPatientById(patientId),
      ]);
      dispatch({ type: "LOAD_SUCCESS", payload: { consultations: recs, patient: p || null } });
    } catch {
      const cached = useConsultationStore
        .getState()
        .consultations.filter((c) => c.patientId === patientId)
        .sort((a, b) => b.date.localeCompare(a.date));
      const cachedP =
        usePatientStore.getState().patients.find((p) => p.id === patientId) || null;
      dispatch({ type: "LOAD_SUCCESS", payload: { consultations: cached, patient: cachedP } });
    }
  }, [patientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── AI fetch ──
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

  // ── Auto pre-fill from last consultation ──
  useEffect(() => {
    if (!editingId && consultations.length > 0) {
      const latest = consultations[0];
      dispatch({
        type: "PATCH_FORM",
        payload: {
          thermal: !formData.thermal ? latest.thermal || "" : formData.thermal,
          appetite: !formData.appetite ? latest.appetite || "" : formData.appetite,
          thirst: !formData.thirst ? latest.thirst || "" : formData.thirst,
          sleep: !formData.sleep ? latest.sleep || "" : formData.sleep,
          miasm: !formData.miasm ? latest.miasm || "" : formData.miasm,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultations, editingId]);

  const remedySuggestions = useMemo(() => {
    if (!consultations || !formData.chiefComplaint) return [];
    return analyzeRemedies(consultations, formData.chiefComplaint);
  }, [consultations, formData.chiefComplaint]);

  const remedyExplanations = useMemo(
    () => generateRemedyExplanations(remedySuggestions, formData.chiefComplaint),
    [remedySuggestions, formData.chiefComplaint]
  );

  const decisionRules = useMemo(() => {
    const last = consultations[0];
    const outcome = normalizeOutcome(last?.outcome);
    return {
      canRepeat:
        !!last &&
        outcome === ConsultationOutcome.IMPROVED &&
        (last.medicines?.length || 0) > 0,
    };
  }, [consultations]);

  const dosageText = formData.medicines
    .map((m: any) => m.dosage || m.instructions || "")
    .filter(Boolean)
    .join("\n");

  // ── Save (identical logic to ConsultationPage) ──
  const handleSave = async () => {
    if (!formData.chiefComplaint) return alert("Chief Complaint is required.");
    if (
      formData.medicines.length === 0 &&
      formData.outcome !== ConsultationOutcome.FIRST_VISIT
    ) {
      const ok = window.confirm("No medicines prescribed. Save as Observation/Wait?");
      if (!ok) return;
    }
    dispatch({ type: "SAVE_START" });
    const session: Consultation = {
      ...formData,
      urine: formData.urine || "",
      stool: formData.stool || "",
      perspiration: formData.perspiration || "",
      allergy: formData.allergy || "",
      familyHistory: formData.familyHistory || "",
      pastHistory: formData.pastHistory || "",
      surgicalHistory: formData.surgicalHistory || "",
      fee: formData.fee || 0,
      paymentStatus: formData.paymentStatus || "pending",
      id: editingId || crypto.randomUUID(),
      patientId,
      date: new Date(formData.formDate).toISOString(),
      followUpDate: formData.formFollowUpDate
        ? new Date(formData.formFollowUpDate).toISOString()
        : undefined,
    };
    const ok = await saveConsultation(session);
    if (ok) {
      dispatch({ type: "SAVE_DONE" });
      await loadData();
      if (onFinish) onFinish();
    }
  };

  // ── Print Rx ──
  const handlePrintRx = () => {
    const data =
      formData.chiefComplaint || formData.medicines.length > 0
        ? {
            ...formData,
            medicines: formData.medicines || [],
            date: formData.formDate ? new Date(formData.formDate).toISOString() : undefined,
            followUpDate: formData.formFollowUpDate
              ? new Date(formData.formFollowUpDate).toISOString()
              : undefined,
          }
        : consultations[0];
    if (!data) return alert("No consultation data to print.");
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return alert("Popup blocked. Please allow popups.");
    const meds = (data.medicines || [])
      .map(
        (m: any) =>
          `<tr><td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:700">${m.name || ""}</td><td style="padding:10px;border-bottom:1px solid #f1f5f9">${m.dosage || ""}</td><td style="padding:10px;border-bottom:1px solid #f1f5f9">${m.duration || ""}</td></tr>`
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Prescription</title><style>@page{size:A4;margin:10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;color:#0f172a;background:white;padding:20px}.header{text-align:center;border-bottom:4px solid #2563eb;padding-bottom:16px;margin-bottom:24px}.clinic-name{font-size:28px;color:#1e3a8a;font-weight:900}.doctor{font-weight:700;color:#475569;margin-top:4px}.patient-strip{display:flex;justify-content:space-between;background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #edf2f7;font-size:13px;margin-bottom:20px}.patient-strip p{margin:0 0 3px}.section-title{font-size:12px;color:#2563eb;text-transform:uppercase;font-weight:900;border-bottom:2px solid #f1f5f9;padding-bottom:5px;margin-bottom:12px;margin-top:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:10px;border-bottom:2px solid #e2e8f0;text-align:left;background:#f8fafc}.followup{background:#eff6ff;padding:16px;border-radius:10px;text-align:center;border:1px solid #bfdbfe;margin-top:20px}.followup-label{font-size:10px;color:#3b82f6;font-weight:800;text-transform:uppercase}.followup-value{font-size:20px;font-weight:900;color:#1e40af;margin-top:6px}.signature{margin-top:40px;text-align:right}.sig-block{display:inline-block;border-top:1px solid #0f172a;padding-top:6px;width:160px;text-align:center;font-weight:800;font-size:13px}</style></head><body><div class="header"><div class="clinic-name">Sakhi Homeopathic Clinic</div><div class="doctor">Dr. Amisha (BHMS)</div></div><div class="patient-strip"><div><p><b>PATIENT:</b> ${patient?.name || patientName || "—"}</p><p><b>AGE / GENDER:</b> ${patient?.age || "—"} / ${patient?.gender || "—"}</p></div><div style="text-align:right"><p><b>COMPLAINT:</b> ${data.chiefComplaint || "—"}</p><p><b>DATE:</b> ${new Date(data.date || Date.now()).toLocaleDateString("en-IN")}</p></div></div><div class="section-title">Rx / Prescription</div><table><thead><tr><th>Remedy &amp; Potency</th><th>Dosage</th><th>Duration</th></tr></thead><tbody>${meds || "<tr><td colspan='3' style='padding:10px;color:#94a3b8'>No medicines prescribed</td></tr>"}</tbody></table><div class="followup"><div class="followup-label">Next Follow-Up</div><div class="followup-value">${data.followUpDate ? new Date(data.followUpDate).toLocaleDateString("en-IN") : "As advised"}</div></div><div class="signature"><div class="sig-block">Authorized Signatory</div></div><script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script></body></html>`);
    win.document.close();
  };

  const handleWhatsAppShare = () => {
    const phone = normalizePatientPhone(patient);
    if (!phone) return alert("Patient phone number missing.");
    const msg = getPrescriptionMessage(patient.name, formData.medicines);
    const link = generateWhatsAppLink(phone, msg);
    if (link) window.open(link, "sakhi_whatsapp_window");
  };

  const last = consultations[0] ?? null;

  if (loading) return <div style={loadingStyle}>Loading...</div>;

  return (
    <div style={containerStyle}>
      <style>{css}</style>

      {/* ── Mode Toggle Bar ── */}
      <div style={modeBarStyle}>
        <div style={modeToggleGroupStyle}>
          <button style={modeActiveBtnStyle} disabled>⚡ Quick Mode</button>
          <button style={modeInactiveBtnStyle} onClick={onSwitchMode}>📋 Classic Mode</button>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
          Streamlined consultation entry
        </div>
      </div>

      {/* ── Patient Header ── */}
      <div style={patientHeaderStyle}>
        <div>
          <h1 style={titleStyle}>{patient?.name || patientName}</h1>
          <div style={metaStyle}>
            <span>{patient?.gender} · {patient?.age} Yrs</span>
            <span style={{ color: "#22c55e" }}>● {consultations.length} Previous Visits</span>
            {last && (
              <span style={{ color: "#64748b" }}>
                Last: {new Date(last.date).toLocaleDateString("en-IN")} · {last.outcome}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="q-btn-secondary" onClick={() => setShowSticker(true)}>🏷️ Sticker</button>
          <button className="q-btn-secondary" onClick={handlePrintRx}>📋 Print Rx</button>
          <button className="q-btn-whatsapp" onClick={handleWhatsAppShare}>📲 WhatsApp</button>
        </div>
      </div>

      <div style={bodyGridStyle}>
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Outcome */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>Outcome</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.values(ConsultationOutcome).map((o) => (
                <button
                  key={o}
                  className={`q-outcome ${formData.outcome === o ? "active" : ""}`}
                  onClick={() => patch({ outcome: o })}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Chief Complaint */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>Chief Complaint *</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={(formData as any).language || "en-IN"}
                onChange={(e) => patch({ language: e.target.value } as any)}
                style={{ ...INPUT, width: "auto", minWidth: 110 }}
              >
                <option value="en-IN">English</option>
                <option value="hi-IN">Hindi</option>
                <option value="gu-IN">Gujarati</option>
              </select>
              <DictationButton
                lang={lang}
                onText={(spoken) =>
                  patch({ chiefComplaint: formData.chiefComplaint ? formData.chiefComplaint + " " + spoken : spoken })
                }
              />
            </div>
            <SmartInput
              multiline
              rows={2}
              style={INPUT}
              value={formData.chiefComplaint}
              onChange={(val) => patch({ chiefComplaint: val })}
              suggestions={SUGGESTIONS.chiefComplaint}
              placeholder="Type or speak complaint..."
            />
          </div>

          {/* Case Notes */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>
              Case Notes
              <DictationButton
                lang={lang}
                onText={(spoken) =>
                  patch({ caseText: formData.caseText ? formData.caseText + " " + spoken : spoken })
                }
              />
            </div>
            <textarea
              style={{ ...INPUT, resize: "vertical" }}
              rows={3}
              value={formData.caseText}
              onChange={(e) => patch({ caseText: e.target.value })}
              placeholder="Symptoms, observations, case details..."
            />
          </div>

          {/* Medicines */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>Rx — Medicines</div>
            {last && (last.medicines?.length || 0) > 0 && (
              <button
                className="q-btn-secondary"
                style={{ marginBottom: 12, fontSize: 12 }}
                onClick={() => patch({ medicines: [...(last.medicines || [])] })}
              >
                🔁 Repeat Last Prescription
              </button>
            )}
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button
                disabled={!decisionRules.canRepeat}
                onClick={() => patch({ medicines: [...(consultations[0]?.medicines || [])] })}
                className="q-decision-btn"
                style={{ opacity: decisionRules.canRepeat ? 1 : 0.3 }}
              >
                🔁 Repeat
              </button>
              <button onClick={() => patch({ medicines: [] })} className="q-decision-btn">🔄 Change</button>
              <button onClick={() => patch({ medicines: [] })} className="q-decision-btn">⏸ Wait</button>
            </div>
            <PrescriptionEditor
              value={state.formData.medicines}
              onChange={(meds) => dispatch({ type: "PATCH_FORM", payload: { medicines: meds } })}
              suggestions={remedySuggestions}
            />
          </div>

          {/* Sticker Note */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>Sticker / Bottle Label Note</div>
            <textarea
              style={{ ...INPUT, resize: "vertical" }}
              rows={2}
              value={dosageText || ""}
              readOnly
              placeholder="Auto-filled from medicine dosage instructions above..."
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              This is auto-generated from medicine dosage fields. Click "🏷️ Sticker" to print.
            </div>
          </div>

          {/* Advanced Sections — Collapsible */}
          <CollapsiblePanel title="Physical Generals" emoji="🌡️">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "0 4px" }}>
              <Field label="Thermal">
                <select style={INPUT} value={formData.thermal || ""} onChange={(e) => patch({ thermal: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Hot">Hot</option>
                  <option value="Cold">Cold</option>
                  <option value="Neutral">Neutral</option>
                </select>
              </Field>
              <Field label="Thirst">
                <select style={INPUT} value={formData.thirst || ""} onChange={(e) => patch({ thirst: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Increased">Increased</option>
                  <option value="Decreased">Decreased</option>
                  <option value="Normal">Normal</option>
                </select>
              </Field>
              <Field label="Appetite">
                <select style={INPUT} value={formData.appetite || ""} onChange={(e) => patch({ appetite: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Increased">Increased</option>
                  <option value="Decreased">Decreased</option>
                  <option value="Normal">Normal</option>
                </select>
              </Field>
              <Field label="Sleep">
                <select style={INPUT} value={formData.sleep || ""} onChange={(e) => patch({ sleep: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Good">Good</option>
                  <option value="Disturbed">Disturbed</option>
                  <option value="Insomnia">Insomnia</option>
                </select>
              </Field>
              <Field label="Desire">
                <input style={INPUT} value={formData.desire || ""} onChange={(e) => patch({ desire: e.target.value })} placeholder="e.g. Sweets" />
              </Field>
              <Field label="Aversion">
                <input style={INPUT} value={formData.aversion || ""} onChange={(e) => patch({ aversion: e.target.value })} placeholder="e.g. Milk" />
              </Field>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="Mentals & Mind" emoji="🧠">
            <div style={{ padding: "0 4px" }}>
              <Field label="Mental & Emotional State">
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <DictationButton lang={lang} onText={(spoken) => patch({ mind: formData.mind ? formData.mind + " " + spoken : spoken })} />
                </div>
                <textarea style={INPUT} rows={2} value={formData.mind || ""} onChange={(e) => patch({ mind: e.target.value })} placeholder="Anxieties, fears, disposition..." />
              </Field>
              <Field label="Generals">
                <textarea style={INPUT} rows={2} value={formData.generals || ""} onChange={(e) => patch({ generals: e.target.value })} placeholder="Constitutional symptoms..." />
              </Field>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="Modalities & Dynamics" emoji="⚙️">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px" }}>
              <Field label="Sensation">
                <input style={INPUT} value={formData.sensation || ""} onChange={(e) => patch({ sensation: e.target.value })} />
              </Field>
              <Field label="Onset / Causation">
                <input style={INPUT} value={formData.onset || ""} onChange={(e) => patch({ onset: e.target.value })} />
              </Field>
              <Field label="Time Modalities">
                <input style={INPUT} value={formData.timeModal || ""} onChange={(e) => patch({ timeModal: e.target.value })} />
              </Field>
              <Field label="Periodicity">
                <input style={INPUT} value={formData.periodicity || ""} onChange={(e) => patch({ periodicity: e.target.value })} />
              </Field>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel title="Medical History" emoji="📋">
            <div style={{ padding: "0 4px" }}>
              <Field label="Allergies">
                <input style={INPUT} value={formData.allergy || ""} onChange={(e) => patch({ allergy: e.target.value })} placeholder="Drug, food, environmental..." />
              </Field>
              <Field label="Family History">
                <textarea style={INPUT} rows={2} value={formData.familyHistory || ""} onChange={(e) => patch({ familyHistory: e.target.value })} placeholder="Hereditary conditions..." />
              </Field>
              <Field label="Past History">
                <textarea style={INPUT} rows={2} value={formData.pastHistory || ""} onChange={(e) => patch({ pastHistory: e.target.value })} placeholder="Previous illnesses..." />
              </Field>
              <Field label="Surgical History">
                <textarea style={INPUT} rows={2} value={formData.surgicalHistory || ""} onChange={(e) => patch({ surgicalHistory: e.target.value })} placeholder="Surgeries, dates..." />
              </Field>
            </div>
          </CollapsiblePanel>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Fee & Follow-up */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>Fee & Follow-up</div>
            <Field label="Consultation Fee (₹)">
              <input
                type="number"
                style={INPUT}
                value={formData.fee || ""}
                onChange={(e) => patch({ fee: Number(e.target.value) })}
                placeholder="Enter amount"
              />
            </Field>
            <Field label="Payment Status">
              <select
                style={INPUT}
                value={formData.paymentStatus || "pending"}
                onChange={(e) => patch({ paymentStatus: e.target.value as PaymentStatus })}
              >
                <option value="pending">⏳ Pending</option>
                <option value="paid">✅ Paid</option>
              </select>
            </Field>
            <Field label="Next Follow-up">
              <input
                type="datetime-local"
                style={INPUT}
                value={formData.formFollowUpDate}
                onChange={(e) => patch({ formFollowUpDate: e.target.value })}
              />
            </Field>
          </div>

          {/* AI Panel */}
          <div style={cardStyle}>
            <div
              style={{ ...cardTitleStyle, cursor: "pointer", userSelect: "none" }}
              onClick={() => setShowAI((v) => !v)}
            >
              🧠 AI Suggestions {showAI ? "▲" : "▼"}
            </div>
            {showAI && (
              <div>
                {remedySuggestions.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={aiSubHeaderStyle}>Materia Medica Matches</div>
                    {remedySuggestions.map((r, i) => (
                      <div key={i} style={aiRowStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 13 }}>{r.name}</span>
                          <span style={r.score > 5 ? highBadgeStyle : possibleBadgeStyle}>
                            {r.score > 5 ? "High" : "Possible"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{r.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
                {remedyExplanations.length > 0 && (
                  <div>
                    <div style={{ ...aiSubHeaderStyle, color: "#7c3aed" }}>🤖 AI Reasoning</div>
                    {remedyExplanations.map((re, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: "#5b21b6", marginBottom: 3 }}>{re.name}</div>
                        <div style={{ fontSize: 11, color: "#6d28d9", background: "#f5f3ff", borderRadius: 8, padding: "5px 8px", lineHeight: 1.5 }}>{re.explanation}</div>
                      </div>
                    ))}
                  </div>
                )}
                {learnedPatterns.length > 0 && (
                  <div>
                    <div style={aiSubHeaderStyle}>Case Patterns</div>
                    {learnedPatterns.map((lp, i) => {
                      const c = lp.confidence || 0;
                      const col = c > 0.75 ? "#10b981" : c > 0.6 ? "#3b82f6" : "#64748b";
                      return (
                        <div key={i} style={aiRowStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 13 }}>{lp.remedy}</span>
                            <span style={{ fontSize: 10, background: col, color: "#fff", padding: "1px 6px", borderRadius: 4, fontWeight: 800 }}>{Math.round(c * 100)}%</span>
                          </div>
                          <div style={{ fontSize: 10, color: "#64748b" }}>Matched {lp.matches} tokens</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {remedySuggestions.length === 0 && learnedPatterns.length === 0 && (
                  <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>
                    Analyzing case tokens...
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Timeline Snapshot */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>📜 Timeline</div>
            {consultations.length === 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>First visit.</p>
            )}
            {consultations.slice(0, 5).map((c) => (
              <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{new Date(c.date).toLocaleDateString("en-IN")}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{c.outcome} · {c.medicines[0]?.name || "Observation"}</div>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={saveBtnStyle}
          >
            {saving ? "Saving..." : isEditing ? "✅ Update Record" : "✅ Save & Finalize"}
          </button>

        </div>
      </div>

      {/* Sticker Modal */}
      {showSticker && (
        <StickerPrint
          patientName={patient?.name || patientName || ""}
          dosageInstructions={dosageText}
          onClose={() => setShowSticker(false)}
        />
      )}
    </div>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  background: "#f1f5f9",
  minHeight: "100vh",
  padding: "24px 32px",
  fontFamily: "'Lora', serif",
};
const loadingStyle: React.CSSProperties = {
  padding: 100, textAlign: "center", fontSize: 18, color: "#64748b", fontWeight: 600,
};
const modeBarStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  marginBottom: 20, padding: "12px 16px",
  background: "#fff", borderRadius: 12, border: "1.5px solid #e2e8f0",
};
const modeToggleGroupStyle: React.CSSProperties = { display: "flex", gap: 6 };
const modeActiveBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "none",
  background: "#0f172a", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "default",
};
const modeInactiveBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const patientHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: 20, padding: "16px 20px",
  background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0",
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a" };
const metaStyle: React.CSSProperties = { display: "flex", gap: 16, marginTop: 6, fontSize: 13, fontWeight: 600, color: "#64748b", flexWrap: "wrap" };
const bodyGridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: "20px 20px 16px",
  border: "1.5px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
};
const cardTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 900, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.07em",
  marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
};
const saveBtnStyle: React.CSSProperties = {
  width: "100%", padding: "16px", background: "#0f172a", color: "#fff",
  border: "none", borderRadius: 14, fontWeight: 800, fontSize: 15,
  cursor: "pointer", boxShadow: "0 8px 20px rgba(15,23,42,0.15)",
};
const aiSubHeaderStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: "#3b82f6",
  textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em",
};
const aiRowStyle: React.CSSProperties = {
  marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #e2e8f0",
};
const highBadgeStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, color: "#fff", background: "#10b981",
  padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
};
const possibleBadgeStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, color: "#fff", background: "#94a3b8",
  padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
};

const css = `
  .q-btn-secondary { background: #fff; color: #0f172a; border: 1.5px solid #e2e8f0; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
  .q-btn-whatsapp { background: #22c55e; color: #fff; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
  .q-outcome { padding: 8px 14px; border-radius: 10px; border: 2px solid #f1f5f9; background: #fff; cursor: pointer; font-weight: 700; font-size: 12px; color: #64748b; transition: 0.15s; }
  .q-outcome.active { background: #2d6a4f; color: #fff; border-color: #2d6a4f; }
  .q-decision-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1.5px solid #e2e8f0; background: #f8fafc; cursor: pointer; font-weight: 700; font-size: 12px; color: #475569; transition: 0.15s; }
  .q-decision-btn:hover { border-color: #2d6a4f; color: #2d6a4f; background: #f0fdf4; }
`;

export default QuickConsultationPage;