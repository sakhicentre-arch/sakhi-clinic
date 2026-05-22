/**
 * ConsultationPage.tsx
 * Sakhi Clinic — Professional Clinical Decision Support System
 * Version: 15.0 (Quick Mode default + Classic Mode preserved + Optimized Medicine UX)
 */

import React, {
  useCallback,
  useEffect,
  useReducer,
  useMemo,
  useState,
  useRef,
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
import LetterPad from "../components/LetterPad";
import { SUGGESTIONS } from "../data/clinicalSuggestions";

import { getLearnedSuggestions } from "../services/learningEngine";
import { generateWhatsAppLink, getPrescriptionMessage, normalizePatientPhone } from "../utils/whatsapp";
import { analyzeRemedies } from "../services/remedyEngine";
import PrintableConsultation from "../components/PrintableConsultation";
import { generateRemedyExplanations } from "../services/aiReasoningEngine";
import { usePatientStore } from "../store/usePatientStore";
import { useConsultationStore } from "../store/useConsultationStore";
import { saveDraft, loadDraft, deleteDraft } from "../services/draftService";
import useKeyboardInset from "../hooks/useKeyboardInset";
import { haptic } from "../utils/haptics";
import RemedyInput from "../components/RemedyInput";
import { loadRemedyDefaults, saveRemedyDefaults } from "../utils/remedyDefaults";
import { useQueueStore } from "../store/queueStore";
import { useUIStore } from "../store/uiStore";
import { deleteRxTemplate, loadRxTemplates, togglePinTemplate, upsertRxTemplate } from "../utils/rxTemplates";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsultationPageProps {
  patientId: string;
  patientName?: string;
  onFinish?: () => void;
  appointmentId?: string;
  onSwitchMode?: () => void;
}

interface FormData extends Partial<Omit<Consultation, "id" | "patientId" | "date" | "followUpDate">> {
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
  loadError: string | null;
}

type PageAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; payload: { consultations: Consultation[]; patient: Patient | null } }
  | { type: "LOAD_ERROR"; payload: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_DONE" }
  | { type: "SAVE_FAIL" }
  | { type: "EDIT_START"; payload: Consultation }
  | { type: "PATCH_FORM"; payload: Partial<FormData> }
  | { type: "SET_LEARNED"; payload: any[] };

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case "LOAD_START": return { ...state, loading: true, loadError: null };
    case "LOAD_SUCCESS": return { ...state, loading: false, consultations: action.payload.consultations, patient: action.payload.patient, loadError: null };
    case "LOAD_ERROR": return { ...state, loading: false, loadError: action.payload };
    case "SAVE_START": return { ...state, saving: true };
    case "SAVE_DONE": return { ...state, saving: false, editingId: null, formData: EMPTY_FORM };
    case "SAVE_FAIL": return { ...state, saving: false };
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
    allergy: (c as any).allergy || "",
    familyHistory: (c as any).familyHistory || "",
    pastHistory: (c as any).pastHistory || "",
    surgicalHistory: (c as any).surgicalHistory || "",
    paymentStatus: (c as any).paymentStatus || "pending",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getImprovementFromOutcome = (outcome: ConsultationOutcome): string => {
  switch (outcome) {
    case ConsultationOutcome.IMPROVED: return "70%";
    case ConsultationOutcome.NO_CHANGE: return "30%";
    case ConsultationOutcome.WORSE: return "10%";
    default: return "";
  }
};

const generateReviewTexts = (complaint: string, onset: string, outcome: ConsultationOutcome) => {
  const trimmedComplaint = complaint.length > 80 ? complaint.substring(0, 77) + "..." : complaint;
  const duration = onset || "થોડા સમય";
  const improvement = getImprovementFromOutcome(outcome);
  const guj = outcome === ConsultationOutcome.FIRST_VISIT
    ? `સખી હોમિયોપેથિક ક્લિનિકમાં મેં ${trimmedComplaint}ની સારવાર શરૂ કરી છે. ડૉક્ટરનું નિદાન ખૂબ જ સચોટ છે.`
    : `હું ${trimmedComplaint} ની સારવાર સખી ક્લિનિકમાં લઇ રહ્યો હતો અને ${duration} માં મને લગભગ ${improvement} રાહત મળી છે. ખુબ સરસ પરિણામ છે.`;
  const eng = outcome === ConsultationOutcome.FIRST_VISIT
    ? `I recently started treatment for ${trimmedComplaint} at Sakhi Homeopathic Clinic. The doctor is very professional and the diagnosis was thorough.`
    : `I highly recommend Sakhi Homeopathic Clinic. I visited for ${trimmedComplaint} and saw ${improvement} improvement within ${duration}. Very happy with the results.`;
  return { guj, eng };
};

const formatFollowUpDate = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

interface FollowUpAction {
  id: string;
  label: string;
  patch: Partial<FormData>;
  title: string;
  disabled?: boolean;
}

const getFollowUpActions = (
  outcome: ConsultationOutcome,
  lastMeds: Medicine[]
): FollowUpAction[] => {
  const lastPrescription = lastMeds.length > 0 ? { medicines: [...lastMeds] } : { medicines: [] };
  switch (outcome) {
    case ConsultationOutcome.IMPROVED:
      return [
        {
          id: "repeat",
          label: "Repeat Remedy",
          title: "Repeat previous prescription and follow up in 7 days",
          patch: { ...lastPrescription, formFollowUpDate: formatFollowUpDate(7) },
          disabled: lastMeds.length === 0,
        },
        {
          id: "wait",
          label: "Wait & Observe",
          title: "Pause medicines and follow up in 5 days",
          patch: { medicines: [], formFollowUpDate: formatFollowUpDate(5) },
        },
      ];

    case ConsultationOutcome.NO_CHANGE:
      return [
        {
          id: "review",
          label: "Review Remedy",
          title: "Keep prior prescription for a shorter follow-up",
          patch: { ...lastPrescription, formFollowUpDate: formatFollowUpDate(5) },
          disabled: lastMeds.length === 0,
        },
        {
          id: "change",
          label: "Change Remedy",
          title: "Clear current prescription and schedule urgent review",
          patch: { medicines: [], formFollowUpDate: formatFollowUpDate(3) },
        },
      ];

    case ConsultationOutcome.WORSE:
      return [
        {
          id: "worse",
          label: "Change Immediately",
          title: "Clear medicines and set urgent review",
          patch: { medicines: [], formFollowUpDate: formatFollowUpDate(2) },
        },
        {
          id: "urgent",
          label: "Urgent Follow-Up",
          title: "Keep prescription if needed and follow up in 2 days",
          patch: { ...lastPrescription, formFollowUpDate: formatFollowUpDate(2) },
          disabled: lastMeds.length === 0,
        },
      ];

    default:
      return [
        {
          id: "start",
          label: "Start Prescription",
          title: "Begin treatment and follow up in 7 days",
          patch: { ...lastPrescription, formFollowUpDate: formatFollowUpDate(7) },
        },
      ];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// QUICK MEDICINE ROW
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_REMEDIES = [
  "Aconite", "Arnica", "Belladonna", "Bryonia", "Calc Carb", "Carbo Veg",
  "Chamomilla", "China", "Gelsemium", "Hepar Sulph", "Ignatia", "Kali Bich",
  "Lachesis", "Lycopodium", "Mercurius", "Natrum Mur", "Nux Vomica",
  "Phosphorus", "Pulsatilla", "Rhus Tox", "Sepia", "Silicea", "Sulphur",
  "Thuja", "Arsenicum Album", "Apis Mel", "Colocynthis", "Drosera",
];
const POTENCIES = ["6C", "30C", "200C", "1M", "10M", "6X", "30X", "Q"];
const DURATIONS = ["3 Days", "5 Days", "7 Days", "10 Days", "14 Days", "1 Month", "SOS"];
const DOSAGE_PRESETS = ["1-0-1", "1-1-1", "0-0-1", "1-0-0", "SOS", "TDS", "BD"];

interface QuickMedRowProps {
  med: Medicine;
  index: number;
  onUpdate: (index: number, updated: Medicine) => void;
  onDelete: (index: number) => void;
  onEnter: (index: number) => void;
  isLast: boolean;
  autoFocusInput?: boolean;
}

const QuickMedRow: React.FC<QuickMedRowProps> = ({ med, index, onUpdate, onDelete, onEnter, isLast, autoFocusInput }) => {
  const potencyRef = useRef<HTMLSelectElement>(null);
  const durationRef = useRef<HTMLSelectElement>(null);
  const instructionsRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof Medicine, val: string) => {
    onUpdate(index, { ...med, [field]: val });
  };

  const setName = (value: string) => {
    const next: Medicine = { ...med, name: value };
    if (!next.potency) next.potency = "30C";
    if (!next.dosage) next.dosage = "1-1-1";
    if (!next.duration) next.duration = "5 Days";
    onUpdate(index, next);
  };

  const focusPotency = () => potencyRef.current?.focus();
  const focusDuration = () => durationRef.current?.focus();
  const focusInstructions = () => instructionsRef.current?.focus();

  return (
    <div style={medRowStyle}>
      <SmartInput
        value={med.name || ""}
        onChange={setName}
        suggestions={COMMON_REMEDIES}
        placeholder="Remedy..."
        style={medSelectStyle}
        autoFocus={autoFocusInput || (isLast && !med.name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.defaultPrevented) {
            e.preventDefault();
            focusPotency();
          }
        }}
      />

      <select
        ref={potencyRef}
        value={med.potency || "30C"}
        onChange={(e) => update("potency", e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusDuration(); } }}
        style={{ ...medSelectStyle, maxWidth: 80 }}
      >
        {POTENCIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
        {DOSAGE_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => update("dosage", d)}
            style={{
              padding: "5px 8px", borderRadius: 6, border: "1.5px solid",
              borderColor: med.dosage === d ? "#2d6a4f" : "#e2e8f0",
              background: med.dosage === d ? "#2d6a4f" : "#fff",
              color: med.dosage === d ? "#fff" : "#475569",
              fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {d}
          </button>
        ))}
      </div>

      <select
        ref={durationRef}
        value={med.duration || "5 Days"}
        onChange={(e) => update("duration", e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusInstructions(); } }}
        style={{ ...medSelectStyle, maxWidth: 100 }}
      >
        {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>

      <input
        ref={instructionsRef}
        style={{ ...medSelectStyle, maxWidth: 140 }}
        value={med.notes || ""}
        onChange={(e) => update("notes", e.target.value)}
        placeholder="Notes..."
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.defaultPrevented) {
            e.preventDefault();
            onEnter(index);
          }
        }}
      />

      <button
        type="button"
        onClick={() => onDelete(index)}
        style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "#ef4444", padding: "4px 8px", borderRadius: 6, flexShrink: 0 }}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
};

const medRowStyle: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "center",
  padding: "10px 12px", background: "#f8fafc",
  border: "1.5px solid #e2e8f0", borderRadius: 12, marginBottom: 8,
  flexWrap: "wrap",
};
const medSelectStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: 13, background: "#fff",
  border: "1.5px solid #e2e8f0", borderRadius: 8,
  fontWeight: 600, color: "#0f172a", outline: "none", flex: 1, minWidth: 120,
};

const MobileSection: React.FC<{
  title: string;
  subtitle?: string;
  testId?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, testId, children }) => (
  <section data-testid={testId} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const MobileField: React.FC<{
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}> = ({ label, optional, children }) => (
  <div className="min-w-0 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {optional && <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Optional</span>}
    </div>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE PANEL
// ─────────────────────────────────────────────────────────────────────────────

const CollapsiblePanel: React.FC<{
  title: string;
  emoji?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}> = ({ title, emoji = "", children, defaultOpen = false, accent = "#64748b" }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 14, marginBottom: 12, background: "#fff", overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "13px 18px", background: open ? "#f0fdf4" : "#f8fafc", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span style={{ fontWeight: 800, fontSize: 12, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>{emoji} {title}</span>
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && <div style={{ padding: "16px 18px 18px" }}>{children}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HYBRID FIELD
// ─────────────────────────────────────────────────────────────────────────────

interface HybridFieldProps {
  fieldKey: string;
  value: string;
  onChange: (val: string) => void;
  lang: string;
  options: string[];
  placeholder?: string;
  rows?: number;
}

const HybridField: React.FC<HybridFieldProps> = ({ value, onChange, lang, options, placeholder = "Type or speak...", rows = 2 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select
        value=""
        onChange={(e) => { if (!e.target.value) return; onChange(value ? value + ", " + e.target.value : e.target.value); e.target.value = ""; }}
        style={{ flex: 1, padding: "7px 10px", fontSize: 12, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 8, fontWeight: 600, color: "#475569", cursor: "pointer" }}
      >
        <option value="">＋ Quick Add...</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <DictationButton lang={lang} onText={(spoken) => onChange(value ? value + " " + spoken : spoken)} />
    </div>
    <textarea style={INPUT} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

const MIND_OPTIONS = ["Anxious", "Fearful", "Irritable", "Sad", "Restless", "Depressed", "Weeping", "Angry", "Indifferent", "Consolation aggravates"];
const GENERALS_OPTIONS = ["Weakness", "Fatigue", "Chilliness", "Perspiration profuse", "Hot patient", "Cold patient", "Better open air", "Worse cold", "Worse heat", "Craving sweets"];
const DESIRE_OPTIONS = ["Sweets", "Sour", "Spicy food", "Cold drinks", "Hot drinks", "Salt", "Fats", "Fruits", "Milk", "Meat"];
const AVERSION_OPTIONS = ["Milk", "Meat", "Fats", "Eggs", "Sweets", "Salt", "Sour", "Oily food", "Vegetables", "Bread"];
const SENSATION_OPTIONS = ["Burning", "Stitching", "Pressing", "Cramping", "Shooting", "Throbbing", "Numbness", "Tingling", "Heaviness", "Tearing"];

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT PROFILE PANEL
// ─────────────────────────────────────────────────────────────────────────────

const PatientProfilePanel: React.FC<{ patient: Patient | null }> = ({ patient }) => {
  const [open, setOpen] = useState(false);
  if (!patient) return null;
  const p = patient as Patient & { education?: string; maritalStatus?: string; occupation?: string; caste?: string; familyHistory?: string; pastHistory?: string; };
  const hasProfileData = p.education || p.maritalStatus || p.occupation || p.caste;
  const hasHistoryData = p.familyHistory || p.pastHistory;
  if (!hasProfileData && !hasHistoryData) return null;
  return (
    <div className="card" style={{ background: "linear-gradient(180deg, #fafafa 0%, #fff 100%)", borderColor: "#e2e8f0", padding: "16px 20px" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, color: "#64748b", letterSpacing: "0.05em" }}>👤 Patient Profile</span>
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {!open && (hasProfileData || hasHistoryData) && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b", fontWeight: 600, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {p.occupation && <span style={profileChipStyle}>{p.occupation}</span>}
          {p.maritalStatus && <span style={profileChipStyle}>{p.maritalStatus}</span>}
          {p.education && <span style={profileChipStyle}>{p.education}</span>}
          {(p.familyHistory || p.pastHistory) && <span style={{ ...profileChipStyle, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>Hx ✓</span>}
        </div>
      )}
      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {hasProfileData && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {p.education && <ProfileField label="Education" value={p.education} />}
              {p.maritalStatus && <ProfileField label="Marital Status" value={p.maritalStatus} />}
              {p.occupation && <ProfileField label="Occupation" value={p.occupation} />}
              {p.caste && <ProfileField label="Caste" value={p.caste} />}
            </div>
          )}
          {p.familyHistory && <div><div style={profileLabelStyle}>Family History</div><div style={profileValueBlockStyle}>{p.familyHistory}</div></div>}
          {p.pastHistory && <div><div style={profileLabelStyle}>Past History</div><div style={profileValueBlockStyle}>{p.pastHistory}</div></div>}
        </div>
      )}
    </div>
  );
};

const ProfileField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div><div style={profileLabelStyle}>{label}</div><div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{value}</div></div>
);

const profileLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 };
const profileValueBlockStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", lineHeight: 1.6 };
const profileChipStyle: React.CSSProperties = { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#475569" };

// ─────────────────────────────────────────────────────────────────────────────
// CASE TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const CASE_TEMPLATES: Record<string, Partial<FormData>> = {
  fever: { chiefComplaint: "Fever with body ache and weakness", thermal: "Hot", thirst: "Increased", appetite: "Reduced", sleep: "Disturbed", onset: "Sudden" },
  gastric: { chiefComplaint: "Acidity, bloating, heaviness after food", thermal: "Hot", thirst: "Normal", appetite: "Irregular", desire: "Spicy food", aversion: "Oily food" },
  skin: { chiefComplaint: "Skin eruption with itching", thermal: "Warm", thirst: "Normal", sleep: "Disturbed due to itching", sensation: "Burning / itching" },
};
const TEMPLATE_META: Record<string, { label: string; emoji: string; color: string; border: string }> = {
  fever:   { label: "Fever",   emoji: "🌡️", color: "#fff7ed", border: "#fed7aa" },
  gastric: { label: "Gastric", emoji: "🫃", color: "#fefce8", border: "#fde68a" },
  skin:    { label: "Skin",    emoji: "🧬", color: "#f0fdf4", border: "#bbf7d0" },
};

// ─────────────────────────────────────────────────────────────────────────────
// FIELD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; span?: boolean; required?: boolean; children: React.ReactNode }> = ({ label, span, required, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span ? "1 / -1" : undefined }}>
    <label style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
    </label>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PRINT RX HELPER (shared between modes)
// ─────────────────────────────────────────────────────────────────────────────

function openRxPopup(
  printableData: any,
  patientName: string,
  patientAge: string | number | undefined,
  patientGender: string | undefined
) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Popup blocked. Please allow popups for this site."); return; }
  const followUpDate = printableData.followUpDate || printableData.formFollowUpDate;
  const outcomeMessage = (() => {
    const outcome = normalizeOutcome(printableData.outcome);
    if (outcome === ConsultationOutcome.WORSE) return "Urgent review recommended.";
    if (outcome === ConsultationOutcome.NO_CHANGE) return "Review remedy and follow-up soon.";
    if (outcome === ConsultationOutcome.IMPROVED) return "Continue current course and review as scheduled.";
    return "Follow-up based on clinical judgement.";
  })();

  const meds = (printableData.medicines || []).map((m: any) => {
    const instructionLine = m.notes || "";
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:700">${m.name || ""}${m.potency ? ` (${m.potency})` : ""}</td>
        <td style="padding:10px;border-bottom:1px solid #f1f5f9">${m.dosage || ""}</td>
        <td style="padding:10px;border-bottom:1px solid #f1f5f9">${m.duration || ""}</td>
      </tr>
      ${instructionLine ? `<tr><td colspan="3" style="padding:8px 10px 12px 10px;color:#475569;font-size:12px">Instruction: ${instructionLine}</td></tr>` : ""}
    `;
  }).join("");

  win.document.write(`<!DOCTYPE html><html><head><title>Prescription</title><style>@page{size:A4;margin:10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;color:#0f172a;background:white;padding:20px}.header{text-align:center;border-bottom:4px solid #2563eb;padding-bottom:16px;margin-bottom:24px}.clinic-name{font-size:28px;color:#1e3a8a;font-weight:900}.doctor{font-weight:700;color:#475569;margin-top:4px}.patient-strip{display:flex;justify-content:space-between;background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #edf2f7;font-size:13px;margin-bottom:20px}.patient-strip p{margin:0 0 3px}.section-title{font-size:12px;color:#2563eb;text-transform:uppercase;font-weight:900;border-bottom:2px solid #f1f5f9;padding-bottom:5px;margin-bottom:12px;margin-top:20px}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:10px;border-bottom:2px solid #e2e8f0;text-align:left;background:#f8fafc}.followup{background:#eff6ff;padding:16px;border-radius:10px;text-align:center;border:1px solid #bfdbfe;margin-top:20px}.followup-label{font-size:10px;color:#3b82f6;font-weight:800;text-transform:uppercase}.followup-value{font-size:20px;font-weight:900;color:#1e40af;margin-top:6px}.followup-note{font-size:12px;color:#475569;margin-top:6px}.signature{margin-top:40px;text-align:right}.sig-block{display:inline-block;border-top:1px solid #0f172a;padding-top:6px;width:160px;text-align:center;font-weight:800;font-size:13px}</style></head><body><div class="header"><div class="clinic-name">Sakhi Homeopathic Clinic</div><div class="doctor">Dr. Amisha (BHMS)</div></div><div class="patient-strip"><div><p><b>PATIENT:</b> ${patientName || "—"}</p><p><b>AGE / GENDER:</b> ${patientAge || "—"} / ${patientGender || "—"}</p></div><div style="text-align:right"><p><b>COMPLAINT:</b> ${printableData.chiefComplaint || "—"}</p><p><b>DATE:</b> ${new Date(printableData.date || Date.now()).toLocaleDateString("en-IN")}</p></div></div><div class="section-title">Rx / Prescription</div><table><thead><tr><th>Remedy &amp; Potency</th><th>Dosage</th><th>Duration</th></tr></thead><tbody>${meds || "<tr><td colspan='3' style='padding:10px;color:#94a3b8'>No medicines prescribed</td></tr>"}</tbody></table><div class="followup"><div class="followup-label">Next Follow-Up</div><div class="followup-value">${followUpDate ? new Date(followUpDate).toLocaleDateString("en-IN") : "As advised"}</div><div class="followup-note">${outcomeMessage}</div></div><div class="signature"><div class="sig-block">Authorized Signatory</div></div><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>`);
  win.document.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ConsultationPage: React.FC<ConsultationPageProps> = ({
  patientId,
  patientName,
  onFinish,
  onSwitchMode,
}) => {
  const [state, dispatch] = useReducer(pageReducer, {
    consultations: [], loading: false, saving: false,
    editingId: null, formData: EMPTY_FORM, patient: null, learnedPatterns: [],
    loadError: null,
  });

  const [mode, setMode] = useState<"quick" | "classic">("quick");
  const [showSticker, setShowSticker] = useState(false);
  const [showLetterPad, setShowLetterPad] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [draftAutoSaveStatus, setDraftAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const keyboard = useKeyboardInset();
  const [mobileStage, setMobileStage] = useState<"complaint" | "exam" | "remedy" | "followup">("complaint");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [showNotesSheet, setShowNotesSheet] = useState(false);
  const [showFollowUpSheet, setShowFollowUpSheet] = useState(false);
  const [showTemplatesSheet, setShowTemplatesSheet] = useState(false);
  const [saveToast, setSaveToast] = useState<null | { kind: "saved"; canNext: boolean }>(null);
  const setActiveConsultation = useUIStore((s) => s.setActiveConsultation);
  const setDraftStatus = useUIStore((s) => s.setDraftStatus);
  const queue = useQueueStore((s) => s.queue);
  const setQueueStatus = useQueueStore((s) => s.setStatus);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const onScroll = () => setHeaderCollapsed(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  const remedyDefaults = useMemo(() => loadRemedyDefaults({ potency: "30C", dosage: "1-1-1", duration: "5 Days" }), []);

  const [autoAdvanceAfterDosage, setAutoAdvanceAfterDosage] = useState(true);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("sakhi.remedyComposer.autoAdvance.v1");
      if (raw === "0") setAutoAdvanceAfterDosage(false);
      if (raw === "1") setAutoAdvanceAfterDosage(true);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("sakhi.remedyComposer.autoAdvance.v1", autoAdvanceAfterDosage ? "1" : "0");
    } catch {
      // ignore
    }
  }, [autoAdvanceAfterDosage]);

  const [composerStepByMedId, setComposerStepByMedId] = useState<Record<string, "dosage" | "duration" | null>>({});
  const setComposerStep = useCallback((medId: string, step: "dosage" | "duration" | null) => {
    setComposerStepByMedId((prev) => ({ ...prev, [medId]: step }));
  }, []);

  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [rxTemplatesVersion, setRxTemplatesVersion] = useState(0);
  const rxTemplates = useMemo(() => {
    rxTemplatesVersion;
    return loadRxTemplates();
  }, [rxTemplatesVersion]);
  const pinnedTemplates = useMemo(() => rxTemplates.filter((t) => t.pinned), [rxTemplates]);
  const recentTemplates = useMemo(() => rxTemplates.filter((t) => !t.pinned), [rxTemplates]);

  const saveAndMaybeToast = async (opts?: { next?: boolean }) => {
    setSaveToast(null);
    setDraftStatus("Saving…");
    try {
      await handleSave();
      setDraftStatus("Saved");
    } catch (err) {
      setDraftStatus("Save failed");
      throw err;
    }

    const currentQueueEntry =
      queue.find((e) => e.patientId === patientId && (appointmentId ? e.appointmentId === appointmentId : true)) ||
      queue.find((e) => e.patientId === patientId) ||
      null;

    if (currentQueueEntry) {
      setQueueStatus(currentQueueEntry.queueId, "done");
    }

    const nextEntry = queue.find((e) => e.status === "waiting" && e.patientId !== patientId) || null;
    const canNext = Boolean(nextEntry);

    if (opts?.next && nextEntry) {
      haptic("success");
      setActiveConsultation(nextEntry.patientId, nextEntry.appointmentId);
      window.scrollTo({ top: 0, behavior: "instant" as any });
      setMobileStage("complaint");
      setSaveToast(null);
      return;
    }

    setSaveToast({ kind: "saved", canNext });
    window.setTimeout(() => setSaveToast(null), 2200);
  };


  const { consultations, loading, saving, editingId, formData, patient, learnedPatterns, loadError } = state;
  const previousConsultation = consultations[0];
  const isEditing = editingId !== null;
  const lang = (formData as any).language || "en-IN";

  const patch = (p: Partial<FormData>) => dispatch({ type: "PATCH_FORM", payload: p });

  // ── Data loading ──
  const loadData = useCallback(async () => {
    dispatch({ type: "LOAD_START" });
    try {
      const [recs, p] = await Promise.all([getConsultationsByPatient(patientId), getPatientById(patientId)]);
      if (!p) {
        throw new Error(`Patient not found for id ${patientId}`);
      }
      dispatch({ type: "LOAD_SUCCESS", payload: { consultations: recs, patient: p } });
    } catch (error) {
      console.error("[ConsultationPage] loadData failed:", error);
      const cachedConsultations = useConsultationStore.getState().consultations.filter((c) => c.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date));
      const cachedPatient = usePatientStore.getState().patients.find((p) => p.id === patientId) || null;
      if (!cachedPatient) {
        dispatch({ type: "LOAD_ERROR", payload: "Unable to resolve patient record. Please reopen consultation from the patient list or queue." });
        return;
      }
      dispatch({ type: "LOAD_SUCCESS", payload: { consultations: cachedConsultations, patient: cachedPatient } });
    }
  }, [patientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ✅ V1A: DRAFT RECOVERY ON MOUNT
  useEffect(() => {
    const recoverDraft = async () => {
      const savedDraft = await loadDraft(patientId);
      if (savedDraft && !draftRecovered) {
        const confirmRecover = window.confirm(
          "📝 Unsaved draft found from your last session. Recover it?"
        );
        if (confirmRecover) {
          dispatch({ type: "PATCH_FORM", payload: savedDraft });
          setDraftRecovered(true);
        } else {
          await deleteDraft(patientId);
        }
      }
    };
    recoverDraft();
  }, [patientId, draftRecovered]);

  // ✅ V1A: AUTO-SAVE DRAFT EVERY 30 SECONDS
  useEffect(() => {
    const autoSaveInterval = setInterval(async () => {
      if (formData.chiefComplaint || formData.caseText || formData.medicines.length > 0) {
        setDraftAutoSaveStatus("saving");
        await saveDraft(patientId, formData);
        setDraftAutoSaveStatus("saved");
        setTimeout(() => setDraftAutoSaveStatus("idle"), 2000);
      }
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [patientId, formData]);

  // ── AI fetch ──
  useEffect(() => {
    const fetchAI = async () => {
      const text = `${formData.chiefComplaint} ${formData.caseText} ${formData.mind}`;
      if (text.trim().length > 15) {
        const learned = await getLearnedSuggestions(text);
        dispatch({ type: "SET_LEARNED", payload: learned });
      } else {
        dispatch({ type: "SET_LEARNED", payload: [] });
      }
    };
    const timer = setTimeout(fetchAI, 1000);
    return () => clearTimeout(timer);
  }, [formData.chiefComplaint, formData.caseText, formData.mind]);

  // ── Auto pre-fill ──
  useEffect(() => {
    if (!editingId && consultations.length > 0) {
      const latest = consultations[0];
      dispatch({
        type: "PATCH_FORM",
        payload: {
          mind:     !formData.mind     ? (latest.mind     || "") : formData.mind,
          generals: !formData.generals ? (latest.generals || "") : formData.generals,
          thermal:  !formData.thermal  ? (latest.thermal  || "") : formData.thermal,
          appetite: !formData.appetite ? (latest.appetite || "") : formData.appetite,
          thirst:   !formData.thirst   ? (latest.thirst   || "") : formData.thirst,
          sleep:    !formData.sleep    ? (latest.sleep    || "") : formData.sleep,
          desire:   !formData.desire   ? (latest.desire   || "") : formData.desire,
          aversion: !formData.aversion ? (latest.aversion || "") : formData.aversion,
          miasm:    !formData.miasm    ? (latest.miasm    || "") : formData.miasm,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultations, editingId]);

  const remedySuggestions = useMemo(() => {
    if (!consultations || !formData.chiefComplaint) return [];
    return analyzeRemedies(consultations, formData.chiefComplaint);
  }, [consultations, formData.chiefComplaint]);

  const { frequentRemedies, lastRemedies } = useMemo(() => {
    const remedyMap: Record<string, number> = {};
    consultations.forEach((c) => {
      c.medicines?.forEach((m) => {
        const name = m.name;
        if (!name) return;
        remedyMap[name] = (remedyMap[name] || 0) + 1;
      });
    });
    const frequentRemedies = Object.entries(remedyMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const lastRemedies = consultations.slice(0, 3).flatMap((c) => c.medicines || []).map((m) => m.name).filter(Boolean);
    return { frequentRemedies, lastRemedies };
  }, [consultations]);

  const remedyExplanations = useMemo(() => generateRemedyExplanations(remedySuggestions, formData.chiefComplaint), [remedySuggestions, formData.chiefComplaint]);

  const recentRemedyNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const c of consultations.slice(0, 20)) {
      for (const m of c.medicines || []) {
        const nm = (m.name || "").trim();
        if (!nm) continue;
        const k = nm.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        names.push(nm);
        if (names.length >= 12) return names;
      }
    }
    return names;
  }, [consultations]);

  const recentPrescriptionTokens = useMemo(() => {
    const out: Array<{ name: string; potency?: string; dosage?: string; duration?: string }> = [];
    const seen = new Set<string>();
    for (const c of consultations.slice(0, 12)) {
      for (const m of c.medicines || []) {
        const name = (m.name || "").trim();
        if (!name) continue;
        const token = {
          name,
          potency: m.potency || "",
          dosage: (m as any).dosage || "",
          duration: (m as any).duration || "",
        };
        const key = `${token.name.toLowerCase()}|${token.potency.toLowerCase()}|${token.dosage.toLowerCase()}|${token.duration.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(token);
        if (out.length >= 10) return out;
      }
    }
    return out;
  }, [consultations]);

  const recentFullRxTemplates = useMemo(() => {
    const templates: Array<{ id: string; label: string; date: string; meds: Medicine[] }> = [];
    for (const c of consultations.slice(0, 6)) {
      const meds = (c.medicines || []).filter((m) => (m.name || "").trim().length > 0);
      if (meds.length === 0) continue;
      templates.push({
        id: c.id,
        label: `${meds.length} remedies`,
        date: c.date,
        meds: meds.map((m) => ({ ...m, id: crypto.randomUUID() })),
      });
      if (templates.length >= 3) break;
    }
    return templates;
  }, [consultations]);

  const decisionRules = useMemo(() => {
    const last = consultations[0];
    const outcome = normalizeOutcome(last?.outcome);
    return { canRepeat: !!last && outcome === ConsultationOutcome.IMPROVED && (last.medicines?.length || 0) > 0 };
  }, [consultations]);

  const followUpActions = useMemo(() => {
    const last = consultations[0];
    return getFollowUpActions(normalizeOutcome(last?.outcome), last?.medicines || []);
  }, [consultations]);

  const dosageText = formData.medicines
    .map((m: any) => [m.dosage, m.notes].filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");

  const applyTemplate = (templateKey: string) => {
    const template = CASE_TEMPLATES[templateKey];
    if (!template) return;
    const safeTemplate: Partial<FormData> = {};
    Object.keys(template).forEach((key) => {
      const typedKey = key as keyof FormData;
      if (!formData[typedKey]) (safeTemplate as any)[typedKey] = template[typedKey as keyof typeof template];
    });
    patch({ ...safeTemplate, medicines: [] });
  };

  // ── Quick medicine handlers ──
  const [focusMedIndex, setFocusMedIndex] = useState<number | null>(null);

  const addMedRow = (baseMeds: Medicine[] = formData.medicines) => {
    const defaults = remedyDefaults;
    const newMed: Medicine = { id: crypto.randomUUID(), name: "", potency: defaults.potency, dosage: defaults.dosage, duration: defaults.duration, notes: "" };
    const nextIndex = baseMeds.length;
    patch({ medicines: [...baseMeds, newMed] });
    setFocusMedIndex(nextIndex);
  };

  useEffect(() => {
    if (formData.medicines.length === 0) {
      addMedRow();
    }
  }, []);

  useEffect(() => {
    if (focusMedIndex !== null) {
      setFocusMedIndex(null);
    }
  }, [formData.medicines.length]);

  const updateMedRow = (index: number, updated: Medicine) => {
    const meds = [...formData.medicines];
    meds[index] = updated;
    patch({ medicines: meds });
  };

  const deleteMedRow = (index: number) => {
    patch({ medicines: formData.medicines.filter((_, i) => i !== index) });
  };

  const handleMedEnter = (index: number) => {
    if (index === formData.medicines.length - 1) {
      addMedRow();
    } else {
      setFocusMedIndex(index + 1);
    }
  };

  const handleFollowUpAction = (action: string) => {
    if (action === "repeat") {
      if (previousConsultation?.medicines?.length) {
        patch({
          medicines: previousConsultation.medicines.map((m) => ({ ...m, id: crypto.randomUUID() })),
        });
      }
      return;
    }

    if (action === "change") {
      patch({ medicines: [] });
      addMedRow([]);
      return;
    }

    if (action === "wait") {
      patch({ medicines: [] });
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 7);
      patch({ formFollowUpDate: nextDate.toISOString().split("T")[0] });
      return;
    }

    if (action === "worse") {
      patch({ medicines: [] });
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 3);
      patch({ formFollowUpDate: nextDate.toISOString().split("T")[0] });
      addMedRow([]);
      return;
    }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!formData.chiefComplaint) return alert("Chief Complaint is required.");
    if (formData.medicines.length === 0 && formData.outcome !== ConsultationOutcome.FIRST_VISIT) {
      const confirmWait = window.confirm("No medicines prescribed. Save this session as 'Observation/Wait' mode?");
      if (!confirmWait) return;
    }
    dispatch({ type: "SAVE_START" });
    let success = false;
    try {
      const session: Consultation = {
        ...formData,
        urine: formData.urine || "", stool: formData.stool || "", perspiration: formData.perspiration || "",
        allergy: formData.allergy || "", familyHistory: formData.familyHistory || "",
        pastHistory: formData.pastHistory || "", surgicalHistory: formData.surgicalHistory || "",
        fee: formData.fee || 0, paymentStatus: formData.paymentStatus || "pending",
        id: editingId || crypto.randomUUID(), patientId,
        date: new Date(formData.formDate).toISOString(),
        followUpDate: formData.formFollowUpDate ? new Date(formData.formFollowUpDate).toISOString() : undefined,
      };
      const ok = await saveConsultation(session);
      if (ok) {
        success = true;
        await deleteDraft(patientId); // ✅ V1A: DELETE DRAFT AFTER SAVE
        dispatch({ type: "SAVE_DONE" });
        await loadData();
        if (onFinish) onFinish();
      } else {
        alert("Unable to save consultation. Please try again.");
      }
    } catch (error) {
      console.error("Error saving consultation:", error);
      alert("Error saving consultation. Please try again.");
    } finally {
      if (!success) dispatch({ type: "SAVE_FAIL" });
    }
  };

  // ── Print Rx ──
  const handlePrintRx = () => {
    const hasMeds = formData.medicines.length > 0;
    if (!hasMeds) { alert("Please add at least one medicine before printing."); return; }
    const data = formData.chiefComplaint || hasMeds
      ? { ...formData, medicines: formData.medicines, date: formData.formDate ? new Date(formData.formDate).toISOString() : undefined, followUpDate: formData.formFollowUpDate ? new Date(formData.formFollowUpDate).toISOString() : undefined }
      : consultations[0];
    if (!data) return;
    openRxPopup(data, patient?.name || patientName || "", patient?.age, patient?.gender);
    setShowPrintMenu(false);
  };

  // ── WhatsApp ──
  const handleWhatsAppShare = () => {
    const phone = normalizePatientPhone(patient);
    if (!phone) return alert("Patient phone number missing.");
    const followUpNote = formData.formFollowUpDate
      ? `\n\nNext follow-up: ${new Date(formData.formFollowUpDate).toLocaleDateString("en-IN")}`
      : formData.outcome === ConsultationOutcome.WORSE
      ? "\n\n⚠️ Urgent review recommended based on current clinical status."
      : "";
    const msg = `${getPrescriptionMessage(patient.name, formData.medicines)}${followUpNote}`;
    const link = generateWhatsAppLink(phone, msg);
    if (link) {
      window.open(link, "sakhi_whatsapp_window");
    } else {
      alert("Unable to generate WhatsApp link. Please verify the patient phone number.");
    }
  };

  const handleWhatsAppBill = () => {
    const rawNumber = patient?.phone || (patient as any)?.mobile || "";
    // WhatsApp bill flow
    const link = generateWhatsAppLink(rawNumber, `*Sakhi Homeopathic Clinic — Bill*\n\nPatient: ${patient?.name || "N/A"}\nConsultation Fee: ₹${formData.fee || 0}\nPayment Status: ${formData.paymentStatus === "paid" ? "✅ Paid" : "⏳ Pending"}\n\nThank you for visiting Sakhi Clinic 🙏`);
    if (!link) return alert("⚠️ Patient mobile number is missing or invalid.");
    window.open(link, "sakhi_whatsapp_window");
  };

  const handleAskReview = () => {
    const rawNumber = patient?.phone || (patient as any)?.mobile || "";
    const name = patient?.name || "Patient";
    const complaint = formData.chiefComplaint;
    // WhatsApp review flow
    if (!complaint) return alert("⚠️ Please enter Chief Complaint to generate a review.");
    const { guj, eng } = generateReviewTexts(complaint, formData.onset || "", formData.outcome);
    const baseUrl = `${window.location.origin}/review`;
    const fullParams = `?g=${encodeURIComponent(guj)}&e=${encodeURIComponent(eng)}`;
    const reviewLink = baseUrl.length + fullParams.length > 1500 ? baseUrl : baseUrl + fullParams;
    const whatsappMessage = `Hello ${name},\n\nThank you for choosing Sakhi Homeopathic Clinic 🙏\n\nWe are glad to be part of your health journey. If you are happy with our service, please share your valuable experience here:\n\n👉 ${reviewLink}\n\nIt takes just 10 seconds and helps us serve you better! 😊`;
    const link = generateWhatsAppLink(rawNumber, whatsappMessage);
    if (!link) return alert("⚠️ Patient mobile number is missing or invalid.");
    window.open(link, "sakhi_whatsapp_window");
    alert("✅ WhatsApp opened. Please ask the patient to click the link and post the review.");
  };

  const handlePrintLetter = () => { setShowLetterPad(true); setTimeout(() => window.print(), 300); };

  const last = consultations[0] ?? null;
  const lastVisitDate = last?.date ? new Date(last.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const lastOutcome = last?.outcome ?? null;
  const timelineConsultations = useMemo(() => consultations.slice(0, 4), [consultations]);
  const lastMedicine = last?.medicines?.[0]?.name ?? null;
  const lastHasMeds = (last?.medicines?.length ?? 0) > 0;
  const isFirstVisit = consultations.length === 0;

  const printableConsultation = formData.chiefComplaint || formData.medicines.length > 0
    ? { ...formData, medicines: formData.medicines || [], date: formData.formDate ? new Date(formData.formDate).toISOString() : undefined, followUpDate: formData.formFollowUpDate ? new Date(formData.formFollowUpDate).toISOString() : undefined }
    : last;

  if (loading) return <div style={fullMessageStyle}>Loading Clinical Timeline...</div>;
  if (loadError) return <div style={fullMessageStyle}>{loadError}</div>;

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED SIDEBAR (used in classic mode)
  // ─────────────────────────────────────────────────────────────────────────

  const sidebar = (
    <aside style={sidebarStyle}>
      <PatientProfilePanel patient={patient} />
      <div className="card intel-card">
        <div style={cardHeaderStyle}>🧠 AI Pattern Insights</div>
        {remedySuggestions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={subHeaderStyle}>Materia Medica Matches</div>
            {remedySuggestions.map((r, i) => (
              <div key={`rem-${i}`} style={patternRowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#1e3a8a" }}>{r.name}</div>
                  <span style={{ fontSize: 9, fontWeight: 900, color: "#fff", background: "#10b981", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>{r.score > 5 ? "High Match" : "Possible"}</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{r.reason}</div>
              </div>
            ))}
          </div>
        )}
        {remedyExplanations.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...subHeaderStyle, color: "#7c3aed" }}>🤖 AI Reasoning</div>
            {remedyExplanations.map((re, i) => (
              <div key={`re-${i}`} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #ede9fe" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#5b21b6", marginBottom: 4 }}>{re.name}</div>
                <div style={{ fontSize: 11, color: "#6d28d9", lineHeight: 1.6, background: "#f5f3ff", border: "1px solid #ede9fe", borderRadius: 8, padding: "6px 10px" }}>{re.explanation}</div>
              </div>
            ))}
          </div>
        )}
        {learnedPatterns.length > 0 && (
          <div>
            <div style={subHeaderStyle}>Case Pattern Signals</div>
            {learnedPatterns.map((lp, idx) => {
              const confidence = lp.confidence || 0;
              let badgeColor = "#64748b"; let badgeText = "Weak Signal";
              if (confidence > 0.75) { badgeColor = "#10b981"; badgeText = "Strong Match"; }
              else if (confidence > 0.6) { badgeColor = "#3b82f6"; badgeText = "Good Correlation"; }
              return (
                <div key={`lp-${idx}`} style={patternRowStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, color: "#1e3a8a" }}>{lp.remedy}</div>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "#fff", background: badgeColor, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>{badgeText}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, marginTop: 4 }}>Confidence Index: {Math.round(confidence * 100)}%</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Matched {lp.matches} clinical tokens</div>
                </div>
              );
            })}
          </div>
        )}
        {remedySuggestions.length === 0 && learnedPatterns.length === 0 && <p style={emptyTextStyle}>Analyzing case tokens for patterns...</p>}
      </div>
      <div className="card" style={{ background: "linear-gradient(180deg, #fdf4ff 0%, #fff 100%)", borderColor: "#e9d5ff" }}>
        <div style={{ ...cardHeaderStyle, color: "#7c3aed" }}>💊 Clinical Memory</div>
        {frequentRemedies.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...subHeaderStyle, color: "#7c3aed" }}>Frequent Remedies</div>
            {frequentRemedies.map(([name, count], i) => (
              <div key={`freq-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3e8ff" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>{name}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#7c3aed", background: "#f3e8ff", padding: "2px 8px", borderRadius: 10 }}>{count}×</span>
              </div>
            ))}
          </div>
        )}
        {lastRemedies.length > 0 && (
          <div>
            <div style={{ ...subHeaderStyle, color: "#7c3aed" }}>Recent Remedies</div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, fontWeight: 600 }}>{lastRemedies.join(", ")}</div>
          </div>
        )}
        {frequentRemedies.length === 0 && lastRemedies.length === 0 && <p style={emptyTextStyle}>No historical remedy patterns yet.</p>}
      </div>
      <div className="card history-card">
        <div style={cardHeaderStyle}>📜 Timeline Snapshot</div>
        {timelineConsultations.map((c) => (
          <div key={c.id} style={historyRowStyle}>
            <div style={{ fontWeight: 700 }}>{new Date(c.date).toLocaleDateString("en-IN")}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{c.outcome} · {c.medicines[0]?.name || "Observation"}</div>
          </div>
        ))}
        {consultations.length === 0 && <p style={emptyTextStyle}>First visit for this patient.</p>}
      </div>
    </aside>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MODE TOGGLE BAR (shared)
  // ─────────────────────────────────────────────────────────────────────────

  const modeToggle = (
    <div style={modeBarStyle}>
      <div style={{ display: "flex", gap: 0, border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <button
          onClick={() => setMode("quick")}
          style={{ padding: "8px 20px", border: "none", background: mode === "quick" ? "#0f172a" : "#fff", color: mode === "quick" ? "#fff" : "#475569", fontWeight: 800, fontSize: 12, cursor: "pointer", transition: "0.15s" }}
        >
          ⚡ Quick Mode
        </button>
        <button
          onClick={() => setMode("classic")}
          style={{ padding: "8px 20px", border: "none", borderLeft: "1.5px solid #e2e8f0", background: mode === "classic" ? "#0f172a" : "#fff", color: mode === "classic" ? "#fff" : "#475569", fontWeight: 800, fontSize: 12, cursor: "pointer", transition: "0.15s" }}
        >
          📋 Classic Mode
        </button>
      </div>
      {isFirstVisit && (
        <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ede9fe", padding: "4px 12px", borderRadius: 20 }}>
          🆕 First Visit
        </span>
      )}
      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
        {mode === "quick" ? "Streamlined entry — medicine-first workflow" : "Full clinical documentation mode"}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // QUICK MODE RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (mode === "quick") {
    const stageItems: Array<{ id: typeof mobileStage; label: string }> = [
      { id: "complaint", label: "Complaint" },
      { id: "exam", label: "Examination" },
      { id: "remedy", label: "Remedy" },
      { id: "followup", label: "Follow-up" },
    ];

    const shouldShowStage = (stage: typeof mobileStage) => !isMobile || mobileStage === stage;

    return (
      <div data-testid="consultation-root" className="min-h-screen bg-slate-50 text-slate-900">
        <style>{customCSS}</style>

        <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-900/95 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {onFinish && (
                <button
                  type="button"
                  onClick={onFinish}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white shadow-sm ring-1 ring-white/10"
                  title="Back"
                >
                  ←
                </button>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Consultation</p>
                <h1 className={`truncate font-semibold text-white ${headerCollapsed ? "text-base" : "text-lg"}`}>{patient?.name || patientName || "Patient"}</h1>
                <p className={`mt-1 text-sm text-slate-300 ${headerCollapsed ? "hidden" : "block"}`}>
                  {patient?.gender || "—"} · {patient?.age ?? "?"} yrs · {consultations.length} visits
                  {isFirstVisit && (
                    <span className="ml-2 inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100">
                      First visit
                    </span>
                  )}
                </p>
                {!headerCollapsed && consultations[0] && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/90 ring-1 ring-white/10">
                      Last: {new Date(consultations[0].date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                    </span>
                    {(consultations[0].medicines?.length || 0) > 0 && (
                      <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/90 ring-1 ring-white/10">
                        Rx: {consultations[0].medicines?.length}
                      </span>
                    )}
                    {consultations[0].followUpDate && (
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold ring-1"
                        style={{
                          background:
                            new Date(consultations[0].followUpDate).getTime() < Date.now()
                              ? "rgba(244, 63, 94, 0.18)"
                              : "rgba(56, 189, 248, 0.18)",
                          color:
                            new Date(consultations[0].followUpDate).getTime() < Date.now()
                              ? "#fecdd3"
                              : "#bae6fd",
                          borderColor:
                            new Date(consultations[0].followUpDate).getTime() < Date.now()
                              ? "rgba(244, 63, 94, 0.35)"
                              : "rgba(56, 189, 248, 0.35)",
                        }}
                      >
                        FU:{" "}
                        {new Date(consultations[0].followUpDate).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAskReview}
                className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-amber-400/30"
              >
                ⭐ Review
              </button>
              <button
                type="button"
                onClick={handleWhatsAppShare}
                data-testid="consultation-whatsapp-button"
                className="rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-emerald-400/30"
              >
                📲 WA Rx
              </button>
              <button
                type="button"
                onClick={handleWhatsAppBill}
                className="rounded-2xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-emerald-500/30"
              >
                💰 Bill
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPrintMenu((v) => !v)}
                  className="rounded-2xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-white shadow-sm"
                >
                  🖨️ Print ▾
                </button>
                {showPrintMenu && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                    <button onClick={handlePrintRx} className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50">📋 Prescription</button>
                    <button onClick={() => { setShowSticker(true); setShowPrintMenu(false); }} className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50">🏷️ Sticker</button>
                    <button onClick={() => { handlePrintLetter(); setShowPrintMenu(false); }} className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50">📄 Certificate</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {isMobile && (
            <div className="mx-auto mt-3 max-w-6xl">
              <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                {stageItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { haptic("tap"); setMobileStage(item.id); }}
                    className={
                      "flex-none rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-white/10 " +
                      (mobileStage === item.id ? "bg-white text-slate-900" : "bg-slate-800 text-white/85")
                    }
                    style={{ minHeight: 44 }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <main className="mx-auto max-w-6xl px-4 pb-44 pt-4 sm:px-6 xl:px-8">
          <div className="space-y-4">
            {shouldShowStage("complaint") && (
            <MobileSection title="Chief Complaint" subtitle="Capture the patient's primary issue" testId="section-chief-complaint">
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={(formData as any).language || "en-IN"}
                      onChange={(e) => patch({ language: e.target.value } as any)}
                      className="rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                    >
                      <option value="en-IN">English</option>
                      <option value="hi-IN">Hindi</option>
                      <option value="gu-IN">Gujarati</option>
                    </select>
                    <DictationButton lang={lang} onText={(spoken) => patch({ chiefComplaint: formData.chiefComplaint ? formData.chiefComplaint + " " + spoken : spoken })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(TEMPLATE_META).map(([key, meta]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyTemplate(key)}
                        className="rounded-2xl border px-3 py-2 text-xs font-semibold text-slate-900"
                        style={{ borderColor: meta.border, backgroundColor: meta.color }}
                      >
                        {meta.emoji} {meta.label}
                      </button>
                    ))}
                  </div>
                </div>
                <SmartInput
                  multiline
                  rows={2}
                  style={{ width: "100%", padding: 16, borderRadius: 20, border: "1.5px solid #e2e8f0", background: "#f8fafc", fontSize: 14 }}
                  value={formData.chiefComplaint}
                  onChange={(val) => patch({ chiefComplaint: val })}
                  suggestions={SUGGESTIONS.chiefComplaint}
                  placeholder="Type or speak complaint..."
                />
              </div>
            </MobileSection>
            )}

            {shouldShowStage("exam") && (
            <MobileSection title="Examination" subtitle="Quick clinical context" testId="section-examination">
              <div className="grid gap-3">
                <MobileField label="Mental / Generals" optional>
                  <HybridField
                    fieldKey="mind"
                    value={formData.mind || ""}
                    onChange={(val) => patch({ mind: val })}
                    lang={lang}
                    options={MIND_OPTIONS}
                    placeholder="Anxieties, fears, disposition…"
                    rows={2}
                  />
                </MobileField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MobileField label="Thermal" optional>
                    <select
                      value={formData.thermal || ""}
                      onChange={(e) => patch({ thermal: e.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                    >
                      <option value="">— Select —</option>
                      <option value="Hot">Hot</option>
                      <option value="Cold">Cold</option>
                      <option value="Neutral">Neutral</option>
                    </select>
                  </MobileField>
                  <MobileField label="Appetite" optional>
                    <select
                      value={formData.appetite || ""}
                      onChange={(e) => patch({ appetite: e.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                    >
                      <option value="">— Select —</option>
                      <option value="Increased">Increased</option>
                      <option value="Decreased">Decreased</option>
                      <option value="Normal">Normal</option>
                    </select>
                  </MobileField>
                </div>
              </div>
            </MobileSection>
            )}

            {shouldShowStage("remedy") && (
            <MobileSection title="Prescription & Remedies" subtitle="Mobile-first remedy cards" testId="section-prescription">
              <div className="flex flex-wrap gap-2">
                {last && (last.medicines?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => patch({ medicines: (last.medicines || []).map((m) => ({ ...m, id: crypto.randomUUID() })) })}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
                  >
                    🔁 Repeat Last
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => patch({ medicines: [] })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  🔄 Clear
                </button>
                <button
                  type="button"
                  onClick={() => { haptic("tap"); setShowTemplatesSheet(true); }}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  ⭐ Templates
                </button>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setAutoAdvanceAfterDosage((v) => !v)}
                    className={
                      "rounded-2xl border px-4 py-2 text-sm font-semibold " +
                      (autoAdvanceAfterDosage ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700")
                    }
                    title="Toggle auto-advance after dosage selection"
                  >
                    {autoAdvanceAfterDosage ? "Auto-advance: ON" : "Auto-advance: OFF"}
                  </button>
                )}
              </div>

              {/* Full prescription templates (multi-remedy reuse) */}
              {recentFullRxTemplates.length > 0 && (
                <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="sakhi-micro mb-2">Recent Full Rx</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                    {recentFullRxTemplates.map((t, idx) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          haptic("success");
                          patch({ medicines: t.meds });
                        }}
                        className="sakhi-tap sakhi-focus-ring flex-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                        style={{ minHeight: 48, minWidth: 220 }}
                        title="Reuse full prescription"
                      >
                        <div className="text-sm font-extrabold text-slate-900">
                          {idx === 0 ? "Last Rx" : `Rx ${idx + 1}`}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-600">
                          {new Date(t.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })} · {t.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.medicines.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No medicines added yet. Add one to begin.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.medicines.map((med, idx) => (
                    <div
                      key={med.id ?? idx}
                      data-testid={`medicine-card-${idx}`}
                      className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-3">
                          <MobileField label={`Remedy ${idx + 1}`}>
                            <RemedyInput
                              value={med.name || ""}
                              onChange={(next) => updateMedRow(idx, { ...med, name: next })}
                              suggestions={COMMON_REMEDIES}
                              recentRemedies={recentRemedyNames}
                              recentPrescriptions={recentPrescriptionTokens}
                              onPrescriptionCommit={(rx) => {
                                const nextMed = {
                                  ...med,
                                  name: rx.name,
                                  potency: rx.potency || med.potency || remedyDefaults.potency,
                                  dosage: rx.dosage || med.dosage || remedyDefaults.dosage,
                                  duration: rx.duration || med.duration || remedyDefaults.duration,
                                };
                                updateMedRow(idx, nextMed as any);
                                saveRemedyDefaults({
                                  potency: nextMed.potency || remedyDefaults.potency,
                                  dosage: (nextMed as any).dosage || remedyDefaults.dosage,
                                  duration: (nextMed as any).duration || remedyDefaults.duration,
                                });
                                handleMedEnter(idx);
                              }}
                              placeholder="Type remedy…"
                              autoFocus={focusMedIndex === idx}
                              potency={med.potency || remedyDefaults.potency}
                              potencies={POTENCIES}
                              onPotencyChange={(p) => {
                                updateMedRow(idx, { ...med, potency: p });
                                saveRemedyDefaults({ potency: p, dosage: med.dosage || remedyDefaults.dosage, duration: med.duration || remedyDefaults.duration });
                                if (med.id) setComposerStep(String(med.id), "dosage");
                              }}
                              onCommit={() => {
                                if (med.id) {
                                  setComposerStep(String(med.id), "dosage");
                                }
                              }}
                            />
                          </MobileField>
                          {/* RemedyComposer controls: mobile uses quick chips; desktop keeps compact selects. */}
                          {isMobile ? (
                            <div className="grid gap-3">
                              <MobileField label="Dosage (tap)">
                                <div
                                  className="flex flex-wrap gap-2"
                                  style={
                                    med.id && composerStepByMedId[String(med.id)] === "dosage"
                                      ? ({ outline: "2px solid rgba(13, 115, 119, 0.25)", outlineOffset: 4, borderRadius: 16 } as any)
                                      : undefined
                                  }
                                >
                                  {DOSAGE_PRESETS.map((d) => (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={() => {
                                        haptic("tap");
                                        updateMedRow(idx, { ...med, dosage: d });
                                        saveRemedyDefaults({ potency: med.potency || remedyDefaults.potency, dosage: d, duration: med.duration || remedyDefaults.duration });
                                        if (med.id) setComposerStep(String(med.id), "duration");
                                        if (autoAdvanceAfterDosage) {
                                          handleMedEnter(idx);
                                        }
                                      }}
                                      className={
                                        "sakhi-tap sakhi-focus-ring rounded-2xl border px-3 py-2 text-xs font-semibold " +
                                        ((med.dosage || remedyDefaults.dosage) === d
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                          : "border-slate-200 bg-white text-slate-700")
                                      }
                                      style={{ minHeight: 40 }}
                                    >
                                      {d}
                                    </button>
                                  ))}
                                </div>
                              </MobileField>

                              <MobileField label="Duration (tap)">
                                <div className="flex flex-wrap gap-2">
                                  {DURATIONS.map((d) => (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={() => {
                                        haptic("tap");
                                        updateMedRow(idx, { ...med, duration: d });
                                        saveRemedyDefaults({ potency: med.potency || remedyDefaults.potency, dosage: med.dosage || remedyDefaults.dosage, duration: d });
                                        if (med.id) setComposerStep(String(med.id), null);
                                      }}
                                      className={
                                        "sakhi-tap sakhi-focus-ring rounded-2xl border px-3 py-2 text-xs font-semibold " +
                                        ((med.duration || remedyDefaults.duration) === d
                                          ? "border-sky-200 bg-sky-50 text-sky-800"
                                          : "border-slate-200 bg-white text-slate-700")
                                      }
                                      style={{ minHeight: 40 }}
                                    >
                                      {d}
                                    </button>
                                  ))}
                                </div>
                              </MobileField>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-3">
                              <MobileField label="Potency">
                                <select
                                  value={med.potency || remedyDefaults.potency}
                                  onChange={(e) => updateMedRow(idx, { ...med, potency: e.target.value })}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm"
                                >
                                  {POTENCIES.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              </MobileField>
                              <MobileField label="Dosage">
                                <select
                                  value={med.dosage || remedyDefaults.dosage}
                                  onChange={(e) => {
                                    updateMedRow(idx, { ...med, dosage: e.target.value });
                                    saveRemedyDefaults({ potency: med.potency || remedyDefaults.potency, dosage: e.target.value, duration: med.duration || remedyDefaults.duration });
                                  }}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm"
                                >
                                  {DOSAGE_PRESETS.map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              </MobileField>
                              <MobileField label="Duration">
                                <select
                                  value={med.duration || remedyDefaults.duration}
                                  onChange={(e) => {
                                    updateMedRow(idx, { ...med, duration: e.target.value });
                                    saveRemedyDefaults({ potency: med.potency || remedyDefaults.potency, dosage: med.dosage || remedyDefaults.dosage, duration: e.target.value });
                                  }}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm"
                                >
                                  {DURATIONS.map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              </MobileField>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteMedRow(idx)}
                          className="mt-1 h-10 w-10 flex-shrink-0 rounded-2xl bg-rose-50 text-rose-600 shadow-sm"
                          title="Remove remedy"
                          aria-label="Remove remedy"
                        >
                          ✕
                        </button>
                      </div>
                      <MobileField label="Notes" optional>
                        <textarea
                          className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                          rows={2}
                          value={med.notes || ""}
                          onChange={(e) => updateMedRow(idx, { ...med, notes: e.target.value })}
                          placeholder="Instruction or note"
                        />
                      </MobileField>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                data-testid="medicine-add-button"
                onClick={() => addMedRow()}
                className="w-full rounded-3xl border border-dashed border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700"
                aria-label="Add medicine"
              >
                ＋ Add medicine
              </button>

              {remedySuggestions.length > 0 && (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-emerald-700">🤖 AI Suggestions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {remedySuggestions.slice(0, 4).map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => patch({ medicines: [...formData.medicines, { id: crypto.randomUUID(), name: r.name, potency: "30C", dosage: "1-1-1", duration: "5 Days", notes: "" }] })}
                        className="rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700"
                      >
                        {r.name} +Add
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </MobileSection>
            )}

            {shouldShowStage("followup") && (
            <MobileSection title="Outcome & Follow-up" subtitle="Quick action and billing" testId="section-outcome">
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.values(ConsultationOutcome).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => patch({ outcome: o })}
                    className={`rounded-2xl px-3 py-3 text-left text-sm font-semibold ${formData.outcome === o ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MobileField label="Next follow-up">
                  <input
                    type="datetime-local"
                    value={formData.formFollowUpDate}
                    onChange={(e) => patch({ formFollowUpDate: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                  />
                </MobileField>
                <MobileField label="Fee (₹)">
                  <input
                    type="number"
                    value={formData.fee || ""}
                    onChange={(e) => patch({ fee: Number(e.target.value) })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                    placeholder="Amount"
                  />
                </MobileField>
                <MobileField label="Payment status">
                  <select
                    value={formData.paymentStatus || "pending"}
                    onChange={(e) => patch({ paymentStatus: e.target.value as PaymentStatus })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="pending">⏳ Pending</option>
                    <option value="paid">✅ Paid</option>
                  </select>
                </MobileField>
              </div>
            </MobileSection>
            )}

            {!isMobile && (
              <MobileSection title="Consultation Notes" subtitle="Keep narrative and mental state together" testId="section-notes">
                <MobileField label="Case Notes">
                  <textarea
                    className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none"
                    rows={4}
                    value={formData.caseText}
                    onChange={(e) => patch({ caseText: e.target.value })}
                    placeholder="Symptoms, observations, history..."
                  />
                </MobileField>
                <MobileField label="Mental / Generals">
                  <HybridField fieldKey="mind" value={formData.mind || ""} onChange={(val) => patch({ mind: val })} lang={lang} options={MIND_OPTIONS} placeholder="Anxieties, fears, disposition..." rows={2} />
                </MobileField>
              </MobileSection>
            )}
          </div>
        </main>

        {!isMobile && (
          <div
            className="sticky bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm"
            style={{
              boxShadow: "0 -10px 30px rgba(15, 23, 42, 0.09)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
              marginTop: "24px",
            }}
          >
            <div className="mx-auto flex max-w-6xl flex-wrap gap-3">
              <button
                type="button"
                data-testid="consultation-save-button"
                onClick={handleSave}
                disabled={saving}
                className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold text-white shadow-sm ${saving ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"}`}
                aria-label="Save consultation"
              >
                {saving ? "Saving..." : isEditing ? "✅ Update Record" : "✅ Save"}
              </button>
              <button
                type="button"
                data-testid="consultation-whatsapp-button"
                onClick={handleWhatsAppShare}
                className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600"
              >
                WA Rx
              </button>
              <button
                type="button"
                onClick={() => setShowPrintMenu((v) => !v)}
                className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                Print
              </button>
            </div>
          </div>
        )}

        {/* Mobile keyboard-aware action bar + sheets */}
        {isMobile && (
          <>
            {saveToast?.kind === "saved" && (
              <div
                data-testid="consultation-saved-toast"
                style={{
                  position: "fixed",
                  left: 12,
                  right: 12,
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px) + 88px)",
                  zIndex: 80,
                  background: "rgba(15, 23, 42, 0.92)",
                  color: "#fff",
                  borderRadius: 16,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.28)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800 }}>Saved</div>
                {saveToast.canNext && (
                  <button
                    type="button"
                    onClick={() => void saveAndMaybeToast({ next: true })}
                    className="sakhi-tap sakhi-focus-ring"
                    style={{ minHeight: 40, padding: "8px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 900, fontSize: 12 }}
                  >
                    Next patient →
                  </button>
                )}
              </div>
            )}
            <div
              data-testid="consultation-action-bar"
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px))`,
                padding: "8px 16px",
                background: "rgba(248, 250, 252, 0.92)",
                borderTop: "1px solid rgba(226, 232, 240, 0.9)",
                backdropFilter: "blur(12px)",
                zIndex: 50,
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    const next = [...(formData.medicines || [])];
                    next.push({ name: "", potency: remedyDefaults.potency, dosage: remedyDefaults.dosage, duration: remedyDefaults.duration } as any);
                    patch({ medicines: next });
                    setMobileStage("remedy");
                  }}
                  style={{ minHeight: 48, borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 12, color: "#0f172a" }}
                  className="sakhi-tap sakhi-focus-ring"
                >
                  + Remedy
                </button>
                <button
                  type="button"
                  onClick={() => { haptic("tap"); setShowNotesSheet(true); }}
                  style={{ minHeight: 48, borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 12, color: "#0f172a" }}
                  className="sakhi-tap sakhi-focus-ring"
                >
                  Notes
                </button>
                <button
                  type="button"
                  onClick={() => { haptic("tap"); setShowFollowUpSheet(true); }}
                  style={{ minHeight: 48, borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 12, color: "#0f172a" }}
                  className="sakhi-tap sakhi-focus-ring"
                >
                  Follow-up
                </button>
                <button
                  type="button"
                  onClick={() => { haptic("tap"); setShowTemplatesSheet(true); }}
                  style={{ minHeight: 48, borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 12, color: "#0f172a" }}
                  className="sakhi-tap sakhi-focus-ring"
                >
                  Templates
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextEntry = queue.find((e) => e.status === "waiting" && e.patientId !== patientId) || null;
                    const shouldNext = Boolean(nextEntry);
                    haptic("success");
                    void saveAndMaybeToast({ next: shouldNext });
                  }}
                  disabled={saving}
                  style={{ minHeight: 48, borderRadius: 16, border: "none", background: "#0D7377", color: "#fff", fontWeight: 900, fontSize: 12, opacity: saving ? 0.65 : 1 }}
                  className="sakhi-tap sakhi-focus-ring"
                >
                  {saving ? "Saving…" : (queue.some((e) => e.status === "waiting" && e.patientId !== patientId) ? "Save & Next" : "Save")}
                </button>
              </div>
            </div>

            {showNotesSheet && (
              <div role="dialog" aria-modal="true" data-testid="notes-sheet" style={{ position: "fixed", inset: 0, zIndex: 70 }}>
                <div onClick={() => setShowNotesSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.45)" }} />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    background: "#fff",
                    padding: 16,
                    boxShadow: "0 -16px 40px rgba(15, 23, 42, 0.18)",
                    maxHeight: "calc(var(--app-vh, 1vh) * 100 - 80px)",
                    overflow: "auto",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>Notes</div>
                    <button type="button" onClick={() => setShowNotesSheet(false)} style={{ border: "none", background: "transparent", fontWeight: 900, color: "#64748b" }}>
                      Close
                    </button>
                  </div>
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>Case Notes</div>
                      <textarea
                        value={formData.caseText}
                        onChange={(e) => patch({ caseText: e.target.value })}
                        rows={6}
                        style={{ marginTop: 8, width: "100%", borderRadius: 16, border: "1px solid #e2e8f0", padding: 12, fontSize: 14, boxSizing: "border-box" }}
                        placeholder="Symptoms, observations, clinical narrative…"
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>Mental</div>
                      <textarea
                        value={formData.mind || ""}
                        onChange={(e) => patch({ mind: e.target.value })}
                        rows={4}
                        style={{ marginTop: 8, width: "100%", borderRadius: 16, border: "1px solid #e2e8f0", padding: 12, fontSize: 14, boxSizing: "border-box" }}
                        placeholder="Anxieties, fears, disposition…"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showFollowUpSheet && (
              <div role="dialog" aria-modal="true" data-testid="followup-sheet" style={{ position: "fixed", inset: 0, zIndex: 70 }}>
                <div onClick={() => setShowFollowUpSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.45)" }} />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    background: "#fff",
                    padding: 16,
                    boxShadow: "0 -16px 40px rgba(15, 23, 42, 0.18)",
                    maxHeight: "calc(var(--app-vh, 1vh) * 100 - 80px)",
                    overflow: "auto",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>Follow-up</div>
                    <button type="button" onClick={() => setShowFollowUpSheet(false)} style={{ border: "none", background: "transparent", fontWeight: 900, color: "#64748b" }}>
                      Close
                    </button>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>Quick intervals</div>
                    <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[
                        { label: "1W", days: 7 },
                        { label: "2W", days: 14 },
                        { label: "6W", days: 42 },
                        { label: "1M", days: 30 },
                        { label: "3M", days: 90 },
                      ].map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            haptic("tap");
                            const next = new Date();
                            next.setDate(next.getDate() + chip.days);
                            patch({ formFollowUpDate: next.toISOString().split("T")[0] });
                            setMobileStage("followup");
                            setShowFollowUpSheet(false);
                          }}
                          style={{ minHeight: 44, padding: "8px 16px", borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 13, color: "#0f172a" }}
                          className="sakhi-tap sakhi-focus-ring"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>Custom date</div>
                      <input
                        type="date"
                        value={(formData.formFollowUpDate || "").slice(0, 10)}
                        onChange={(e) => patch({ formFollowUpDate: e.target.value })}
                        style={{ marginTop: 8, width: "100%", minHeight: 48, borderRadius: 16, border: "1px solid #e2e8f0", padding: "0 12px", fontSize: 14, boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showTemplatesSheet && (
              <div role="dialog" aria-modal="true" data-testid="rx-templates-sheet" style={{ position: "fixed", inset: 0, zIndex: 70 }}>
                <div onClick={() => setShowTemplatesSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.45)" }} />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    background: "#fff",
                    padding: 16,
                    boxShadow: "0 -16px 40px rgba(15, 23, 42, 0.18)",
                    maxHeight: "calc(var(--app-vh, 1vh) * 100 - 80px)",
                    overflow: "auto",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>Prescription Templates</div>
                    <button type="button" onClick={() => setShowTemplatesSheet(false)} style={{ border: "none", background: "transparent", fontWeight: 900, color: "#64748b" }}>
                      Close
                    </button>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <div>
                      <div className="sakhi-micro">Save current as template</div>
                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        <input
                          value={templateNameDraft}
                          onChange={(e) => setTemplateNameDraft(e.target.value)}
                          placeholder="Template name (e.g., Chronic cough follow-up)"
                          className="sakhi-input sakhi-focus-ring"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const meds = (formData.medicines || [])
                              .filter((m) => (m.name || "").trim().length > 0)
                              .map((m: any) => ({ name: m.name, potency: m.potency, dosage: m.dosage, duration: m.duration, notes: m.notes || "" }));
                            if (meds.length === 0) {
                              alert("Add at least one remedy to save a template.");
                              return;
                            }
                            const name = (templateNameDraft || "").trim() || `Template (${meds.length} remedies)`;
                            upsertRxTemplate({ id: crypto.randomUUID(), name, pinned: true, medicines: meds });
                            setRxTemplatesVersion((v) => v + 1);
                            setTemplateNameDraft("");
                            haptic("success");
                          }}
                          className="sakhi-btn-primary sakhi-tap sakhi-focus-ring"
                        >
                          Pin Template
                        </button>
                      </div>
                    </div>

                    {pinnedTemplates.length > 0 && (
                      <div>
                        <div className="sakhi-micro">Pinned</div>
                        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                          {pinnedTemplates.map((t) => (
                            <div key={t.id} className="rounded-3xl border border-slate-200 bg-white p-3" style={{ display: "grid", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }} className="truncate">{t.name}</div>
                                  <div className="sakhi-caption" style={{ marginTop: 2 }}>{t.medicines.length} remedies</div>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      haptic("tap");
                                      togglePinTemplate(t.id, false);
                                      setRxTemplatesVersion((v) => v + 1);
                                    }}
                                    className="sakhi-tap sakhi-focus-ring"
                                    style={{ minHeight: 40, padding: "8px 10px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 12 }}
                                  >
                                    Unpin
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      haptic("tap");
                                      deleteRxTemplate(t.id);
                                      setRxTemplatesVersion((v) => v + 1);
                                    }}
                                    className="sakhi-tap sakhi-focus-ring"
                                    style={{ minHeight: 40, padding: "8px 10px", borderRadius: 14, border: "1px solid #fee2e2", background: "#fff1f2", color: "#be123c", fontWeight: 900, fontSize: 12 }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  haptic("success");
                                  patch({
                                    medicines: t.medicines.map((m: any) => ({
                                      id: crypto.randomUUID(),
                                      name: m.name,
                                      potency: m.potency || remedyDefaults.potency,
                                      dosage: m.dosage || remedyDefaults.dosage,
                                      duration: m.duration || remedyDefaults.duration,
                                      notes: m.notes || "",
                                    })),
                                  });
                                  setShowTemplatesSheet(false);
                                  setMobileStage("remedy");
                                  window.scrollTo({ top: 0, behavior: "instant" as any });
                                }}
                                className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
                              >
                                Use Template
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {recentTemplates.length > 0 && (
                      <div>
                        <div className="sakhi-micro">Recent</div>
                        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                          {recentTemplates.slice(0, 6).map((t) => (
                            <div key={t.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-3" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }} className="truncate">{t.name}</div>
                                <div className="sakhi-caption" style={{ marginTop: 2 }}>{t.medicines.length} remedies</div>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    haptic("tap");
                                    togglePinTemplate(t.id, true);
                                    setRxTemplatesVersion((v) => v + 1);
                                  }}
                                  className="sakhi-tap sakhi-focus-ring"
                                  style={{ minHeight: 40, padding: "8px 10px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, fontSize: 12 }}
                                >
                                  Pin
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    haptic("success");
                                    patch({
                                      medicines: t.medicines.map((m: any) => ({
                                        id: crypto.randomUUID(),
                                        name: m.name,
                                        potency: m.potency || remedyDefaults.potency,
                                        dosage: m.dosage || remedyDefaults.dosage,
                                        duration: m.duration || remedyDefaults.duration,
                                        notes: m.notes || "",
                                      })),
                                    });
                                    setShowTemplatesSheet(false);
                                    setMobileStage("remedy");
                                  }}
                                  className="sakhi-tap sakhi-focus-ring"
                                  style={{ minHeight: 40, padding: "8px 10px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#0f172a", color: "#fff", fontWeight: 900, fontSize: 12 }}
                                >
                                  Use
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {showLetterPad && (
          <div className="print-only">
            <LetterPad patient={patient} consultation={printableConsultation} />
          </div>
        )}

        {showSticker && (
          <StickerPrint
            patientName={patient?.name || patientName || ""}
            dosageInstructions={dosageText}
            onClose={() => setShowSticker(false)}
          />
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLASSIC MODE RENDER (preserved exactly)
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...containerStyle, padding: isMobile ? "16px 20px" : "24px 40px" }}>
      <style>{customCSS}</style>

      {modeToggle}

      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>{patient?.name || patientName}</h1>
          <div style={metaGridStyle}>
            <span>{patient?.gender} · {patient?.age} Yrs</span>
            <span style={{ color: "#22c55e" }}>● {consultations.length} Previous Visits</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleAskReview} className="btn-review">⭐ Ask for Review</button>
          <button className="btn-secondary" onClick={() => setShowSticker(true)}>🏷️ Print Sticker</button>
          <button className="btn-secondary" onClick={handlePrintLetter}>📄 Print Certificate</button>
          <button className="btn-secondary" onClick={handlePrintRx} disabled={formData.medicines.length === 0}>📋 Print Rx</button>
          <button onClick={handleWhatsAppShare} className="btn-whatsapp">📲 WhatsApp Rx</button>
          <button onClick={handleWhatsAppBill} className="btn-whatsapp">💰 Send Bill</button>
        </div>
      </header>

      <div style={{ ...contentGridStyle, gridTemplateColumns: isMobile ? "1fr" : "1fr 340px" }}>
        <main style={{ ...formPanelStyle, minHeight: isMobile ? "auto" : "calc(100vh - 220px)" }}>
          <div style={outcomeGridStyle}>
            {Object.values(ConsultationOutcome).map((o) => (
              <button key={o} className={`btn-outcome ${formData.outcome === o ? "active" : ""}`} onClick={() => patch({ outcome: o })}>{o}</button>
            ))}
          </div>

          {/* BILLING */}
          <div style={{ marginBottom: 28, padding: "16px 20px", borderRadius: 14, background: "linear-gradient(135deg, #f0fdf4 0%, #fefce8 100%)", border: "1.5px solid #bbf7d0", display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", width: "100%", marginBottom: -8 }}>💰 Billing</div>
            <Field label="Consultation Fee (₹)">
              <input type="number" style={{ ...INPUT, width: 160 }} value={formData.fee || ""} onChange={(e) => patch({ fee: Number(e.target.value) })} placeholder="Enter fee" />
            </Field>
            <Field label="Payment Status">
              <select style={{ ...INPUT, width: 160 }} value={formData.paymentStatus || "pending"} onChange={(e) => patch({ paymentStatus: e.target.value as PaymentStatus })}>
                <option value="pending">⏳ Pending</option>
                <option value="paid">✅ Paid</option>
              </select>
            </Field>
          </div>

          {/* SMART CASE TEMPLATES */}
          <div style={{ marginBottom: 32, padding: "20px 24px", borderRadius: 16, background: "linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)", border: "1.5px solid #e0f2fe" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>⚡ Smart Case Templates</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {Object.entries(TEMPLATE_META).map(([key, meta]) => (
                <button key={key} onClick={() => applyTemplate(key)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, border: `1.5px solid ${meta.border}`, background: meta.color, cursor: "pointer", fontWeight: 800, fontSize: 13, color: "#1e293b", transition: "all 0.18s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.10)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; }}>
                  <span style={{ fontSize: 18 }}>{meta.emoji}</span>{meta.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>⚠️ Clicking a template fills empty fields only. Your existing input will not be overwritten.</div>
          </div>

          {/* SECTION 1 */}
          <section className="form-group">
            <h3 className="group-title">1. Clinical Core & Mentals</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Field label="Chief Complaint" required span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <select value={(formData as any).language || "en-IN"} onChange={(e) => patch({ language: e.target.value } as any)} style={{ padding: "8px 12px", fontSize: 13, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 8, fontWeight: 600, color: "#475569", cursor: "pointer", minWidth: 120 }}>
                    <option value="en-IN">English</option>
                    <option value="hi-IN">Hindi</option>
                    <option value="gu-IN">Gujarati</option>
                  </select>
                  <DictationButton lang={lang} onText={(spoken) => patch({ chiefComplaint: formData.chiefComplaint ? formData.chiefComplaint + " " + spoken : spoken })} />
                </div>
                <SmartInput multiline rows={2} style={INPUT} value={formData.chiefComplaint} onChange={(val) => patch({ chiefComplaint: val })} suggestions={SUGGESTIONS.chiefComplaint} placeholder="Type or speak complaint..." />
              </Field>
              <Field label="Mental & Emotional State" span>
                <HybridField fieldKey="mind" value={formData.mind || ""} onChange={(val) => patch({ mind: val })} lang={lang} options={MIND_OPTIONS} placeholder="Anxieties, fears, disposition..." rows={2} />
              </Field>
              <Field label="Detailed Case History" span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <DictationButton lang={lang} onText={(spoken) => patch({ caseText: formData.caseText ? formData.caseText + " " + spoken : spoken })} />
                </div>
                <textarea style={INPUT} rows={3} value={formData.caseText} onChange={(e) => patch({ caseText: e.target.value })} placeholder="Full description of symptoms..." />
              </Field>
              <Field label="Family History" span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <DictationButton lang={lang} onText={(spoken) => patch({ familyHistory: formData.familyHistory ? formData.familyHistory + " " + spoken : spoken })} />
                </div>
                <textarea style={INPUT} rows={2} value={formData.familyHistory || ""} onChange={(e) => patch({ familyHistory: e.target.value })} placeholder="Hereditary conditions, family ailments..." />
              </Field>
              <Field label="Past Medical History" span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <DictationButton lang={lang} onText={(spoken) => patch({ pastHistory: formData.pastHistory ? formData.pastHistory + " " + spoken : spoken })} />
                </div>
                <textarea style={INPUT} rows={2} value={formData.pastHistory || ""} onChange={(e) => patch({ pastHistory: e.target.value })} placeholder="Previous illnesses, vaccinations, treatments..." />
              </Field>
              <Field label="Surgical History" span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <DictationButton lang={lang} onText={(spoken) => patch({ surgicalHistory: formData.surgicalHistory ? formData.surgicalHistory + " " + spoken : spoken })} />
                </div>
                <textarea style={INPUT} rows={2} value={formData.surgicalHistory || ""} onChange={(e) => patch({ surgicalHistory: e.target.value })} placeholder="Surgeries, dates, complications..." />
              </Field>
            </div>
          </section>

          {/* SECTION 2 */}
          <section className="form-group">
            <h3 className="group-title">2. Physical Generals & Constitutional</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <Field label="Thermal">
                <select style={INPUT} value={formData.thermal || ""} onChange={(e) => patch({ thermal: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Hot">Hot</option><option value="Cold">Cold</option><option value="Neutral">Neutral</option>
                </select>
              </Field>
              <Field label="Thirst">
                <select style={INPUT} value={formData.thirst || ""} onChange={(e) => patch({ thirst: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Increased">Increased</option><option value="Decreased">Decreased</option><option value="Normal">Normal</option>
                </select>
              </Field>
              <Field label="Appetite">
                <select style={INPUT} value={formData.appetite || ""} onChange={(e) => patch({ appetite: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Increased">Increased</option><option value="Decreased">Decreased</option><option value="Normal">Normal</option>
                </select>
              </Field>
              <Field label="Desires">
                <HybridField fieldKey="desire" value={formData.desire || ""} onChange={(val) => patch({ desire: val })} lang={lang} options={DESIRE_OPTIONS} placeholder="e.g. Sweets, cold drinks..." rows={1} />
              </Field>
              <Field label="Aversions">
                <HybridField fieldKey="aversion" value={formData.aversion || ""} onChange={(val) => patch({ aversion: val })} lang={lang} options={AVERSION_OPTIONS} placeholder="e.g. Milk, oily food..." rows={1} />
              </Field>
              <Field label="Sleep & Dreams">
                <select style={INPUT} value={formData.sleep || ""} onChange={(e) => patch({ sleep: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Good">Good</option><option value="Disturbed">Disturbed</option><option value="Insomnia">Insomnia</option>
                </select>
              </Field>
              <Field label="Allergies">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input style={{ ...INPUT, flex: 1 }} value={formData.allergy || ""} onChange={(e) => patch({ allergy: e.target.value })} placeholder="Drug, food, environmental allergies..." />
                  <DictationButton lang={lang} onText={(spoken) => patch({ allergy: formData.allergy ? formData.allergy + " " + spoken : spoken })} />
                </div>
              </Field>
              <Field label="Miasm">
                <input style={INPUT} value={formData.miasm || ""} onChange={(e) => patch({ miasm: e.target.value })} />
              </Field>
              <Field label="Case Type">
                <select style={INPUT} value={formData.caseType || "chronic"} onChange={(e) => patch({ caseType: e.target.value as any })}>
                  <option value="chronic">Chronic Case</option>
                  <option value="acute">Acute / Crisis</option>
                </select>
              </Field>
              <Field label="Generals" span>
                <HybridField fieldKey="generals" value={formData.generals || ""} onChange={(val) => patch({ generals: val })} lang={lang} options={GENERALS_OPTIONS} placeholder="General constitutional symptoms..." rows={2} />
              </Field>
            </div>
          </section>

          {/* SECTION 3 */}
          <section className="form-group">
            <h3 className="group-title">3. Modalities & Dynamics</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              <Field label="Sensation">
                <HybridField fieldKey="sensation" value={formData.sensation || ""} onChange={(val) => patch({ sensation: val })} lang={lang} options={SENSATION_OPTIONS} placeholder="e.g. Burning, stitching..." rows={1} />
              </Field>
              <Field label="Time Modalities"><input style={INPUT} value={formData.timeModal || ""} onChange={(e) => patch({ timeModal: e.target.value })} /></Field>
              <Field label="Onset / Causation"><input style={INPUT} value={formData.onset || ""} onChange={(e) => patch({ onset: e.target.value })} /></Field>
              <Field label="Periodicity"><input style={INPUT} value={formData.periodicity || ""} onChange={(e) => patch({ periodicity: e.target.value })} /></Field>
            </div>
          </section>

          {/* SECTION 4 */}
          <section className="form-group">
            <h3 className="group-title">4. Objective Observation</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
              <Field label="Posture"><input style={INPUT} value={formData.posture || ""} onChange={(e) => patch({ posture: e.target.value })} /></Field>
              <Field label="Gesture"><input style={INPUT} value={formData.gesture || ""} onChange={(e) => patch({ gesture: e.target.value })} /></Field>
              <Field label="Behaviour"><input style={INPUT} value={formData.behaviour || ""} onChange={(e) => patch({ behaviour: e.target.value })} /></Field>
              <Field label="Speech"><input style={INPUT} value={formData.communication || ""} onChange={(e) => patch({ communication: e.target.value })} /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <Field label="Urine"><input style={INPUT} value={formData.urine || ""} onChange={(e) => patch({ urine: e.target.value })} placeholder="e.g. Burning, frequent, yellow" /></Field>
              <Field label="Stool"><input style={INPUT} value={formData.stool ?? ""} onChange={(e) => patch({ stool: e.target.value })} placeholder="Consistency, freq, color..." /></Field>
              <Field label="Perspiration"><input style={INPUT} value={formData.perspiration ?? ""} onChange={(e) => patch({ perspiration: e.target.value })} placeholder="Location, odor, time..." /></Field>
            </div>
          </section>

          {/* LAST VISIT SUMMARY */}
          {last && (
            <div style={{ marginBottom: 28, padding: "18px 20px", borderRadius: 16, background: "linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)", border: "1.5px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
                <div><div style={lastVisitLabelStyle}>Last Visit</div><div style={lastVisitValueStyle}>{lastVisitDate ?? "—"}</div></div>
                <div>
                  <div style={lastVisitLabelStyle}>Outcome</div>
                  <div style={{ ...lastVisitValueStyle, color: lastOutcome === ConsultationOutcome.IMPROVED ? "#16a34a" : lastOutcome === ConsultationOutcome.WORSE ? "#dc2626" : "#475569" }}>{lastOutcome ?? "—"}</div>
                </div>
                <div><div style={lastVisitLabelStyle}>Last Medicine</div><div style={lastVisitValueStyle}>{lastMedicine ?? (lastHasMeds ? "—" : "Observation")}</div></div>
                {(last.medicines?.length ?? 0) > 1 && (
                  <div><div style={lastVisitLabelStyle}>+ More</div><div style={{ ...lastVisitValueStyle, color: "#64748b" }}>{last.medicines.length - 1} remedy(s)</div></div>
                )}
              </div>
              <button className="btn-decision" style={{ flexShrink: 0, background: "#fff", borderColor: "#86efac" }} onClick={() => patch({ medicines: [...(last.medicines || [])] })}>🔁 Repeat Last Prescription</button>
            </div>
          )}

          {/* SECTION 5 */}
          <section className="form-group" style={{ background: "#f8fafc", padding: 24, borderRadius: 16, border: "1.5px solid #e2e8f0" }}>
            <h3 className="group-title">5. Clinical Decision & Rx</h3>
            {followUpActions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                  {followUpActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => ["repeat", "change", "wait", "worse"].includes(action.id)
                      ? handleFollowUpAction(action.id)
                      : patch(action.patch)
                    }
                    title={action.title}
                    disabled={action.disabled}
                    className={`btn-decision ${action.disabled ? "disabled" : ""}`}
                    style={{ minWidth: 140 }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            <div style={decisionGridStyle}>
              <button disabled={!decisionRules.canRepeat} onClick={() => handleFollowUpAction("repeat")} className={`btn-decision ${!decisionRules.canRepeat ? "disabled" : ""}`}>🔁 Repeat Last Selection</button>
              <button onClick={() => handleFollowUpAction("change")} className="btn-decision">🔄 Change Remedy</button>
              <button onClick={() => handleFollowUpAction("wait")} className="btn-decision">⏸ Wait / Placebo</button>
            </div>
            <div style={{ marginTop: 24 }}>
              <PrescriptionEditor value={state.formData.medicines} onChange={(meds) => dispatch({ type: "PATCH_FORM", payload: { medicines: meds } })} suggestions={remedySuggestions} />
            </div>
          </section>

          <footer style={formFooterStyle}>
            <div style={{ width: 250 }}>
              <Field label="Next Follow-up">
                <input type="datetime-local" style={INPUT} value={formData.formFollowUpDate} onChange={(e) => patch({ formFollowUpDate: e.target.value })} />
              </Field>
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? "Finalizing Transaction..." : isEditing ? "Update Clinical Record" : "Save & Finalize Session"}
            </button>
          </footer>
        </main>

        {sidebar}
      </div>

      {showLetterPad && (
        <div className="print-only">
          <LetterPad patient={patient} consultation={printableConsultation} />
        </div>
      )}

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

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = { background: "#f8fafc", minHeight: "100vh", padding: "24px 40px", fontFamily: "'Lora', serif" };
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 16 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 32, fontWeight: 800, color: "#0f172a" };
const metaGridStyle: React.CSSProperties = { display: "flex", gap: 16, marginTop: 8, fontSize: 13, fontWeight: 600, color: "#64748b" };
const contentGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 340px", gap: 28, alignItems: "start", minWidth: 0 };
const formPanelStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, padding: 36, border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.04)", minHeight: "calc(100vh - 220px)", minWidth: 0 };
const outcomeGridStyle: React.CSSProperties = { display: "flex", gap: 10, marginBottom: 36, flexWrap: "wrap" };
const decisionGridStyle: React.CSSProperties = { display: "flex", gap: 12 };
const formFooterStyle: React.CSSProperties = { marginTop: 48, paddingTop: 32, borderTop: "2px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 };
const sidebarStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 24 };
const cardHeaderStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "#64748b", marginBottom: 16, letterSpacing: "0.05em" };
const subHeaderStyle: React.CSSProperties = { fontSize: 10, fontWeight: 900, color: "#3b82f6", textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.05em" };
const patternRowStyle: React.CSSProperties = { marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #e2e8f0" };
const historyRowStyle: React.CSSProperties = { padding: "10px 0", borderBottom: "1px solid #f1f5f9" };
const emptyTextStyle: React.CSSProperties = { fontSize: 13, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "20px 0" };
const fullMessageStyle: React.CSSProperties = { padding: 100, textAlign: "center", fontSize: 18, color: "#64748b", fontWeight: 600 };
const lastVisitLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 };
const lastVisitValueStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0f172a" };
const modeBarStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, marginBottom: 24, padding: "12px 16px", background: "#fff", borderRadius: 14, border: "1.5px solid #e2e8f0", flexWrap: "wrap" };
const quickTopBarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)", color: "#fff", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", flexWrap: "wrap", gap: 8 };
const quickBodyStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, padding: "20px 24px", alignItems: "start", minWidth: 0 };
const qCardStyle: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: "18px 18px 14px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" };
const qCardTitleStyle: React.CSSProperties = { fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 };
const quickIconBtnStyle: React.CSSProperties = { background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontWeight: 800, fontSize: 18, cursor: "pointer", borderRadius: 8, padding: "6px 12px" };
const quickActionBtnStyle: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" };
const printMenuItemStyle: React.CSSProperties = { width: "100%", padding: "12px 16px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9" };
const medHeaderStyle: React.CSSProperties = { fontSize: 9, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", flex: 1 };

const INPUT: React.CSSProperties = { width: "100%", padding: "12px 16px", fontSize: 14, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 12, boxSizing: "border-box", outline: "none" };

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
  .btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-review { background: #f59e0b; color: #fff; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
  .btn-review:hover { background: #d97706; transform: translateY(-1px); }
  .card { background: #fff; border: 1px solid #e2e8f0; padding: 24px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); }
  .intel-card { background: linear-gradient(180deg, #eff6ff 0%, #fff 100%); border-color: #bfdbfe; }
  .print-only { display: none; }
  @media print {
    body * { visibility: hidden; }
    .print-only, .print-only * { visibility: visible; }
    .print-only { display: block; position: absolute; left: 0; top: 0; width: 100%; background: white; }
  }
  @media (max-width: 768px) {
    body { font-size: 14px; }
    [style*="gridTemplateColumns: 1fr 340px"] { grid-template-columns: 1fr !important; }
    [style*="gridTemplateColumns: 1fr 280px"] { grid-template-columns: 1fr !important; }
    [style*="padding: 24px 40px"] { padding: 16px 12px !important; }
    [style*="padding: 36px"] { padding: 18px 14px !important; }
    .form-group { margin-bottom: 24px; }
    .group-title { font-size: 12px; }
    .btn-decision { font-size: 11px; padding: 12px; }
    .btn-primary { padding: 14px 20px; font-size: 13px; }
    .btn-review, .btn-whatsapp { padding: 10px 14px; font-size: 12px; }
  }
`;

const quickCSS = `
  @media (max-width: 900px) {
    .quick-body { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 768px) {
    [style*="padding: 20px 24px"] { padding: 12px 12px !important; }
    [style*="gridTemplateColumns: 1fr 280px"] { grid-template-columns: 1fr !important; }
    [style*="gridTemplateColumns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
    [style*="gridTemplateColumns: repeat(3, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
    [style*="gridTemplateColumns: repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
    [style*="gridTemplateColumns: repeat(2, 1fr)"] { grid-template-columns: 1fr !important; }
  }
`;

export default ConsultationPage;
