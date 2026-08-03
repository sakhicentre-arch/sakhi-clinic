import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UserPlus,
  Search,
  Phone,
  User,
  History as HistoryIcon,
  Brain,
  Pencil,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  BarChart3,
  Zap,
  AlertTriangle,
  MessageCircle,
  Receipt,
  RefreshCw,
  Trash2,
  X,
  Eye,
} from "lucide-react";
import { usePatientStore } from "../store/usePatientStore";
import { useConsultationStore } from "../store/useConsultationStore";
import { useUIStore } from "../store/uiStore";
import { usePatientSearch } from "../hooks/usePatientSearch";
import { PullToRefreshScrollRegion, SplitPane, ScrollRegion } from "../components/layout/LayoutPrimitives";
import PaymentScreenshotViewer from "../components/PaymentScreenshotViewer";
import { normalizePatientPhone } from "../utils/whatsapp";
import { openWhatsApp } from "../services/whatsappService";
import { addPatient as saveNewPatient, updatePatient as saveUpdatedPatient, deletePatient as removePatient } from "../services/patientService";
import { getConsultationOutstanding, getConsultationCollected } from "../services/paymentService";
import { listRemindersByPatient } from "../services/reminderQueueService";
import type { ReminderQueueEntry } from "../services/db";
import { generateId } from "../utils/generateId";
import type { Consultation, Report } from "../types/models";

type PatientPageConsultation = Omit<Consultation, "outcome" | "medicines"> & {
  outcome?: string;
  medicines?: { name: string; dosage?: string; duration?: string }[];
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  age: string;
  gender: string;
  phone: string;
  address: string;
  referredBy: string;
  referredTo: string;
  miasm: string;
  // ✅ V43: Extended patient profile fields
  education: string;
  maritalStatus: string;
  occupation: string;
  caste: string;
  familyHistory: string;
  pastHistory: string;
}

// ─── FIX 1: Added initialPatientId prop ──────────────────────────────────────
// This allows App.tsx to pre-select a patient when navigating from another page.
// Previously, handlePatientSelect in App.tsx set a local selectedPatientId that
// was never passed down — the selection was orphaned and the RHS never opened.
interface PatientPageProps {
  goToConsultation?: (patientId: string, appointmentId: string) => void;
  initialPatientId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number | undefined): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);

const getOutcomeColor = (outcome?: string): string => {
  if (outcome === "Improved") return "#10b981";
  if (outcome === "Worse" || outcome === "NewSymptoms") return "#ef4444";
  return "#6366f1";
};

const getOutcomeBg = (outcome?: string): string => {
  if (outcome === "Improved") return "#f0fdf4";
  if (outcome === "Worse" || outcome === "NewSymptoms") return "#fef2f2";
  return "#f8fafc";
};

const getOutcomeBorder = (outcome?: string): string => {
  if (outcome === "Improved") return "#bbf7d0";
  if (outcome === "Worse" || outcome === "NewSymptoms") return "#fecaca";
  return "#e0e7ff";
};

// Payment Tracker (V54) has 4 statuses -- pending/paid/partial/waived --
// vs. the old paid/pending-only badge this replaced.
const getPaymentStatusStyle = (status?: string): { bg: string; color: string; border: string } => {
  switch (status) {
    case "paid":
      return { bg: "#dcfce7", color: "#166534", border: "#86efac" };
    case "partial":
      return { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" };
    case "waived":
      return { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" };
    default:
      return { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
  }
};

// ─── Sub-components ───────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      style={{
        padding: "24px",
        background: "#f8fafc",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div className="sakhi-skeleton" style={{ height: 14, width: "45%", marginBottom: 14 }} />
        <div className="sakhi-skeleton" style={{ height: 52, borderRadius: 18, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="sakhi-skeleton" style={{ height: 220, borderRadius: 20 }} />
          <div className="sakhi-skeleton" style={{ height: 220, borderRadius: 20 }} />
        </div>
        <div style={{ marginTop: 12 }} className="sakhi-caption">
          Loading patients…
        </div>
      </div>
    </div>
  );
}

function EmptySelect() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 40px",
        textAlign: "center",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: "120px",
          height: "120px",
          backgroundColor: "#eff6ff",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "32px",
          border: "3px solid #bfdbfe",
          boxShadow: "0 12px 32px -8px rgba(37,99,235,0.12)",
        }}
      >
        <User size={56} color="#2563eb" strokeWidth={1.5} />
      </div>
      <h2
        style={{
          fontSize: "26px",
          fontWeight: 900,
          color: "#0f172a",
          marginBottom: "12px",
          letterSpacing: "-0.5px",
        }}
      >
        Select a Patient
      </h2>
      <p
        style={{
          fontSize: "15px",
          maxWidth: "380px",
          lineHeight: "1.8",
          color: "#64748b",
          fontWeight: 500,
          margin: 0,
        }}
      >
        Choose a patient from the registry on the left to view their clinical
        profile, treatment history, and financial summary.
      </p>
    </div>
  );
}

// ─── Stable default form — OUTSIDE the component ─────────────────────────────
// Must not be inside the component body. A const declared inside a component
// is recreated on every render, giving it a new object identity each time.
// The sync effect's else-branch calls setFormData(DEFAULT_FORM) — if this
// were an inline object declared inside the component, React would see a new
// formData reference on every render, causing cascading re-renders that race
// against setSelectedId and can leave selectedPatient null mid-cycle.
const DEFAULT_FORM: FormData = {
  name: "",
  age: "",
  gender: "Male",
  phone: "",
  address: "",
  referredBy: "",
  referredTo: "",
  miasm: "Psora",
  education: "",
  maritalStatus: "",
  occupation: "",
  caste: "",
  familyHistory: "",
  pastHistory: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientPage(
  props: PatientPageProps = {}
): React.ReactElement {
  // ── Stores ───────────────────────────────────────────────────────────────
  // CRITICAL FIX: Every usePatientStore() call with NO selector subscribes to
  // the ENTIRE store. Any mutation (addPatient, persist rehydration, etc.)
  // triggers a full re-render AND returns new function references for
  // loadPatients/addPatient/etc. This made the loading useEffect's dep array
  // [loadPatients, loadConsultations] unstable — the effect re-fired on every
  // render, creating a continuous re-render loop that reset selectedId timing.
  //
  // Fix: extract each action via its own scalar selector. Zustand action
  // functions are created once in the store closure and never change — a
  // per-action selector always returns the same reference, making deps stable.
  const patients = usePatientStore((state) => state.patients) || [];
  const loadPatients = usePatientStore((state) => state.loadPatients);
  const updatePatient = usePatientStore((state) => state.updatePatient);
  const deletePatient = usePatientStore((state) => state.deletePatient);
  const setPatientStoreError = usePatientStore((state) => state.setLastError);

  const rawConsultations = useConsultationStore(
    (state) => state.consultations
  ) || [];
  const consultations = rawConsultations as PatientPageConsultation[];
  const loadConsultations = useConsultationStore((state) => state.loadConsultations);
  const setActivePatientId = useUIStore((state) => state.setActivePatientId);

  // ── Local State ──────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "finance">("overview");
  // RC1 Patient Ledger: Reminder Sent/Date/Count/Notes tracking -- reuses
  // reminderQueueService.ts's own queue records rather than a separate
  // per-patient counter that could drift out of sync with them.
  const [patientReminders, setPatientReminders] = useState<ReminderQueueEntry[]>([]);
  // ✅ V43: Collapsible section state for left panel form
  const [showProfile, setShowProfile] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState(false);
  // Payment Ledger completion: paymentReferenceNumber/paymentNotes/
  // paymentScreenshotDataUrl already exist on Consultation (recorded via
  // paymentService.ts) but were never rendered in the Finance tab.
  const [viewingScreenshot, setViewingScreenshot] = useState<{ dataUrl: string; date?: string } | null>(null);

  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ── FIX 2: handleOpenPatient — corrected parameter type ──────────────────
  //
  // ROOT CAUSE OF BUG:
  //   usePatientSearch declares:  onOpen: (patientId: string) => void
  //   It calls onOpen like:       onOpen(focusedPatient.id)   ← passes a STRING
  //
  //   The OLD handler was written as:  (patient: any) => setSelectedId(patient.id)
  //   When it received the STRING "1714900000000", it did:
  //     "1714900000000".id  →  undefined
  //     setSelectedId(undefined)  →  patients.find() returns nothing  →  RHS stays empty
  //
  // FIX:
  //   Accept patientId as a string directly (matching the hook's contract).
  //   setSelectedId receives the correct string ID → patients.find() succeeds → RHS renders.
  // ─────────────────────────────────────────────────────────────────────────
  const syncSelectedId = useCallback(
    (patientId: string | null) => {
      setSelectedId(patientId);
      setActivePatientId(patientId);
    },
    [setActivePatientId]
  );

  const handleOpenPatient = useCallback((patientId: string) => {
    if (patientId != null && patientId !== "") {
      syncSelectedId(String(patientId));
    }
  }, [syncSelectedId]);

  // ── Task 4: usePatientSearch — uses handleOpenPatient defined above ──────
  // ✅ FIX: Added safe defaults (filteredPatients = [], focusedIndex = 0)
  //         to prevent "Cannot read properties of undefined" crash
  const {
    searchTerm,
    setSearchTerm,
    filteredPatients = [],
    focusedIndex = 0,
    setFocusedIndex,
    handleSearchKeyDown,
  } = usePatientSearch({ patients, onOpen: handleOpenPatient });

  // ── Data Loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([loadPatients(), loadConsultations()]);
      } catch (err) {
        console.error("Failed to load clinic data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [loadPatients, loadConsultations]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── FIX 3: Sync initialPatientId prop → local selectedId ─────────────────
  //
  // Previously, App.tsx's handlePatientSelect set a local selectedPatientId
  // state but never passed it to PatientPage. The selection was orphaned.
  //
  // Now App.tsx passes initialPatientId={selectedPatientId} as a prop.
  // When it changes (e.g. user navigates from Dashboard → patient), this
  // effect fires and opens the correct patient in the RHS.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (props.initialPatientId) {
      syncSelectedId(String(props.initialPatientId));
    }
  }, [props.initialPatientId, syncSelectedId]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── FIX 4: selectedPatient — String() coercion for type-safe ID matching ─
  //
  // The original strict === comparison silently fails when a patient ID is
  // stored as a number (e.g., from Dexie auto-increment or legacy records)
  // while selectedId is a string (always the case here). String() coercion
  // on both sides makes comparison type-safe at zero runtime cost.
  // ─────────────────────────────────────────────────────────────────────────
  const patientsById = useMemo(() => {
    const map = new Map<string, typeof patients[number]>();
    for (const patient of patients) {
      map.set(String(patient.id), patient);
    }
    return map;
  }, [patients]);

  const consultationsByPatientId = useMemo(() => {
    const map = new Map<string, PatientPageConsultation[]>();
    consultations.forEach((consultation) => {
      const key = String(consultation.patientId || "");
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(consultation);
      } else {
        map.set(key, [consultation]);
      }
    });
    return map;
  }, [consultations]);

  const selectedPatient = useMemo(
    () =>
      (selectedId ? patientsById.get(String(selectedId)) : null) || null,
    [selectedId, patientsById]
  );

  const patientConsultations = useMemo(
    () => consultationsByPatientId.get(String(selectedId || "")) || [],
    [consultationsByPatientId, selectedId]
  );

  const sortedConsultations = useMemo(
    () =>
      [...patientConsultations].sort(
        (a, b) =>
          new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      ),
    [patientConsultations]
  );

  const healingTrend = useMemo(() => {
    if (sortedConsultations.length < 1) return "Stable";
    const last = sortedConsultations[0]?.outcome;
    if (last === "Worse" || last === "NewSymptoms") return "Suppressed";
    if (last === "Improved") return "Healing";
    return "Stable";
  }, [sortedConsultations]);

  const miasmAnalytics = useMemo(() => {
    const counts = { Psora: 0, Sycosis: 0, Syphilis: 0 };
    patientConsultations.forEach((c) => {
      if (c.miasm && Object.prototype.hasOwnProperty.call(counts, c.miasm)) {
        counts[c.miasm as keyof typeof counts] += 1;
      }
    });
    return counts;
  }, [patientConsultations]);

  // Reuses paymentService.ts's getConsultationOutstanding/getConsultationCollected
  // -- the same rules the Dashboard/Payment Tracker use -- instead of a
  // second, independently (and incorrectly) recomputed paid/pending split
  // that didn't understand "partial"/"waived" statuses.
  const revenueAnalytics = useMemo(() => {
    const withFee = patientConsultations.filter((c) => c.fee && c.fee > 0);
    const totalBilled = withFee.reduce((sum, c) => sum + (c.fee || 0), 0);
    const totalPaid = withFee.reduce((sum, c) => sum + getConsultationCollected(c), 0);
    const totalPending = withFee.reduce((sum, c) => sum + getConsultationOutstanding(c), 0);

    const paidConsults = withFee.filter((c) => getConsultationCollected(c) > 0);
    const lastPaid =
      paidConsults.length > 0
        ? paidConsults.reduce((a, b) =>
            new Date(a.paymentDate || a.date) > new Date(b.paymentDate || b.date) ? a : b
          )
        : null;

    return {
      totalPaid,
      totalPending,
      totalBilled,
      lastPayment: lastPaid
        ? { amount: getConsultationCollected(lastPaid), date: lastPaid.paymentDate || lastPaid.date }
        : null,
    };
  }, [patientConsultations]);

  // ── Sync form with selected patient ──────────────────────────────────────
  useEffect(() => {
    if (selectedPatient) {
      setFormData({
        name: selectedPatient.name || "",
        age: selectedPatient.age ? String(selectedPatient.age) : "",
        gender: selectedPatient.gender || "Male",
        phone: selectedPatient.phone || "",
        address: selectedPatient.address || "",
        referredBy: (selectedPatient as any).referredBy || "",
        referredTo: (selectedPatient as any).referredTo || "",
        miasm: (selectedPatient as any).miasm || "Psora",
        // ✅ V43: Sync new fields from existing patient record
        education: (selectedPatient as any).education || "",
        maritalStatus: (selectedPatient as any).maritalStatus || "",
        occupation: (selectedPatient as any).occupation || "",
        caste: (selectedPatient as any).caste || "",
        familyHistory: (selectedPatient as any).familyHistory || "",
        pastHistory: (selectedPatient as any).pastHistory || "",
      });
      setReports((selectedPatient as any).reports || []);
    } else {
      setFormData(DEFAULT_FORM);
      setReports([]);
    }
  }, [selectedPatient]);

  // ── Reminder history (RC1 Patient Ledger) ─────────────────────────────────
  useEffect(() => {
    if (!selectedPatient) {
      setPatientReminders([]);
      return;
    }
    let cancelled = false;
    listRemindersByPatient(selectedPatient.id)
      .then((rows) => {
        if (!cancelled) setPatientReminders(rows);
      })
      .catch((err) => console.error("[PatientPage] Failed to load reminder history:", err));
    return () => {
      cancelled = true;
    };
  }, [selectedPatient]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFormChange = useCallback(
    (field: keyof FormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleAdd = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Patient name is required.");
      return;
    }
    if (!formData.phone.trim()) {
      alert("Phone number is required.");
      return;
    }

    const normalizedPhone = formData.phone.trim();
    const duplicateExists = patients.some(
      (p) =>
        String(p.phone || "").trim() === normalizedPhone &&
        (!selectedPatient || p.id !== selectedPatient.id)
    );

    if (duplicateExists) {
      alert(
        "A patient with this phone number already exists. Please use the existing patient record or enter a different phone number."
      );
      return;
    }

    setIsSaving(true);
    try {
      if (selectedPatient) {
        // ✅ V43: All new fields included in update payload
        await saveUpdatedPatient(selectedPatient.id, {
          ...formData,
          reports: reports as any,
        });
      } else {
        // ✅ V43: All new fields included in add payload
        await saveNewPatient({
          ...formData,
          id: generateId(),
          createdAt: new Date().toISOString(),
          reports: reports as any,
        } as any);
      }
      setPatientStoreError(null);
      setFormData(DEFAULT_FORM);
      setReports([]);
      syncSelectedId(null);
    } catch (error) {
      console.error("Error saving patient:", error);
      setPatientStoreError(error instanceof Error ? error.message : "Error saving patient.");
      alert("Error saving patient. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePatient = async (
    e: React.MouseEvent,
    id: string
  ): Promise<void> => {
    e.stopPropagation();
    if (!window.confirm("Delete this patient? This cannot be undone.")) return;
    try {
      await removePatient(id);
      setPatientStoreError(null);
      if (selectedId === id) syncSelectedId(null);
    } catch (error) {
      console.error("Error deleting patient:", error);
      setPatientStoreError(error instanceof Error ? error.message : "Error deleting patient.");
      alert("Error deleting patient. Please try again.");
    }
  };

  const handleEditPatient = useCallback(
    (e: React.MouseEvent, patientId: string) => {
      e.stopPropagation();
      syncSelectedId(patientId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [syncSelectedId]
  );

  const handleReportUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newReport: Report = {
      id: generateId(),
      name: file.name,
      fileUrl: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
    };
    setReports((prev) => [...prev, newReport]);
  };

  const handleSendReminder = useCallback((): void => {
    if (!selectedPatient) return;
    const message = `Dear ${selectedPatient.name}, this is a reminder from Sakhi Homeopathic Clinic. You have a pending payment of ${formatCurrency(revenueAnalytics.totalPending)}. Please visit us to clear the balance. Thank you!`;
    const phone = selectedPatient.phone || (selectedPatient as any).mobile || "";
    if (!openWhatsApp({ phone, message })) return alert("⚠️ Patient mobile number is missing or invalid.");
  }, [selectedPatient, revenueAnalytics.totalPending]);

  const goToConsultation = useCallback(
    (appointmentId = "") => {
      if (!selectedPatient) return;
      props.goToConsultation?.(selectedPatient.id, appointmentId);
    },
    [selectedPatient, props]
  );

  const handleTimelineClick = useCallback(
    (consultationId: string) => {
      if (!selectedPatient) return;
      props.goToConsultation?.(selectedPatient.id, consultationId);
    },
    [selectedPatient, props]
  );

  // ── Loading Guard ────────────────────────────────────────────────────────
  if (isLoading) return <LoadingScreen />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <SplitPane axis={isMobile ? "vertical" : "horizontal"} style={{ ...S.page, overflow: isMobile ? "visible" : S.page.overflow }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
      <aside
        style={{
          ...S.leftPanel,
          width: isMobile ? "100%" : S.leftPanel.width,
          minWidth: isMobile ? 0 : S.leftPanel.minWidth,
          borderRight: isMobile ? "none" : S.leftPanel.borderRight,
          borderBottom: isMobile ? "1px solid var(--border, #e2e8f0)" : "none",
        }}
      >
        {/* Registration Form */}
        {/* ── LAYOUT FIX 2: formHeader capped at 52vh, scrollable internally ── */}
        <div style={S.formHeader}>
          <div style={S.formTitleRow}>
            <div style={S.formIconWrap}>
              <UserPlus size={18} color="#2563eb" />
            </div>
            <div>
              <div style={S.formSectionLabel}>Patient Registry</div>
              <h2 style={S.formTitle}>
                {selectedPatient ? "Edit Patient" : "Quick Entry"}
              </h2>
            </div>
            {selectedPatient && (
              <button
                style={S.clearBtn}
                onClick={() => syncSelectedId(null)}
                title="Cancel edit"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <form
            data-testid="patient-registration-form"
            onSubmit={handleAdd}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {/* ── EXISTING CORE FIELDS (unchanged) ── */}
            <input
              data-testid="patient-name-input"
              className="sakhi-input"
              style={S.input}
              placeholder="Full Name *"
              value={formData.name}
              onChange={(e) => handleFormChange("name", e.target.value)}
              required
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                data-testid="patient-age-input"
                className="sakhi-input"
                style={{ ...S.input, flex: 1 }}
                placeholder="Age"
                value={formData.age}
                onChange={(e) => handleFormChange("age", e.target.value)}
              />
              <select
                data-testid="patient-gender-select"
                className="sakhi-input"
                style={{ ...S.input, flex: 1.4 }}
                value={formData.gender}
                onChange={(e) => handleFormChange("gender", e.target.value)}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <input
              data-testid="patient-phone-input"
              className="sakhi-input"
              style={S.input}
              placeholder="Phone Number *"
              value={formData.phone}
              onChange={(e) => handleFormChange("phone", e.target.value)}
              required
            />
            <textarea
              className="sakhi-input"
              style={{ ...S.input, minHeight: "72px", resize: "vertical" }}
              placeholder="Address"
              value={formData.address}
              onChange={(e) => handleFormChange("address", e.target.value)}
            />

            {/* ── V43: PATIENT PROFILE SECTION (collapsible) ── */}
            <div style={S.collapsibleSection}>
              <button
                type="button"
                style={S.collapsibleHeader}
                onClick={() => setShowProfile((v) => !v)}
              >
                <span style={S.collapsibleLabel}>Patient Profile</span>
                <ChevronDown
                  size={15}
                  style={{
                    transition: "transform 0.2s",
                    transform: showProfile ? "rotate(180deg)" : "rotate(0deg)",
                    color: "#64748b",
                  }}
                />
              </button>
              {showProfile && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <select
                      className="sakhi-input"
                      style={{ ...S.input, flex: 1 }}
                      value={formData.education}
                      onChange={(e) => handleFormChange("education", e.target.value)}
                    >
                      <option value="">Education</option>
                      <option value="Illiterate">Illiterate</option>
                      <option value="Primary">Primary</option>
                      <option value="10th Pass">10th Pass</option>
                      <option value="12th Pass">12th Pass</option>
                      <option value="Graduate">Graduate</option>
                      <option value="Post-Graduate">Post-Graduate</option>
                      <option value="Other">Other</option>
                    </select>
                    <select
                      className="sakhi-input"
                      style={{ ...S.input, flex: 1 }}
                      value={formData.maritalStatus}
                      onChange={(e) => handleFormChange("maritalStatus", e.target.value)}
                    >
                      <option value="">Marital Status</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      className="sakhi-input"
                      style={{ ...S.input, flex: 1 }}
                      placeholder="Occupation"
                      value={formData.occupation}
                      onChange={(e) => handleFormChange("occupation", e.target.value)}
                    />
                    <input
                      className="sakhi-input"
                      style={{ ...S.input, flex: 1 }}
                      placeholder="Caste"
                      value={formData.caste}
                      onChange={(e) => handleFormChange("caste", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── V43: MEDICAL HISTORY SECTION (collapsible) ── */}
            <div style={S.collapsibleSection}>
              <button
                type="button"
                style={S.collapsibleHeader}
                onClick={() => setShowHistory((v) => !v)}
              >
                <span style={S.collapsibleLabel}>Medical History</span>
                <ChevronDown
                  size={15}
                  style={{
                    transition: "transform 0.2s",
                    transform: showHistory ? "rotate(180deg)" : "rotate(0deg)",
                    color: "#64748b",
                  }}
                />
              </button>
              {showHistory && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
                  <textarea
                    className="sakhi-input"
                    style={{ ...S.input, minHeight: "64px", resize: "vertical" }}
                    placeholder="Family History (e.g. Father: Diabetes, Mother: BP)"
                    value={formData.familyHistory}
                    onChange={(e) => handleFormChange("familyHistory", e.target.value)}
                  />
                  <textarea
                    className="sakhi-input"
                    style={{ ...S.input, minHeight: "64px", resize: "vertical" }}
                    placeholder="Past History (e.g. Appendectomy 2015, Penicillin allergy)"
                    value={formData.pastHistory}
                    onChange={(e) => handleFormChange("pastHistory", e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* ── EXISTING FIELDS CONTINUED (unchanged) ── */}
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                className="sakhi-input"
                style={{ ...S.input, flex: 1 }}
                placeholder="Referred By"
                value={formData.referredBy}
                onChange={(e) => handleFormChange("referredBy", e.target.value)}
              />
              <input
                className="sakhi-input"
                style={{ ...S.input, flex: 1 }}
                placeholder="Referred To"
                value={formData.referredTo}
                onChange={(e) => handleFormChange("referredTo", e.target.value)}
              />
            </div>
            <select
              className="sakhi-input"
              style={{ ...S.input }}
              value={formData.miasm}
              onChange={(e) => handleFormChange("miasm", e.target.value)}
            >
              <option value="Psora">Psora</option>
              <option value="Sycosis">Sycosis</option>
              <option value="Syphilis">Syphilis</option>
            </select>
            <button
              data-testid="save-patient-btn"
              type="submit"
              style={{
                ...S.btnPrimary,
                opacity: isSaving ? 0.7 : 1,
                cursor: isSaving ? "not-allowed" : "pointer",
              }}
              disabled={isSaving}
              className="sakhi-btn-primary"
            >
              {isSaving ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <UserPlus size={16} />
              )}
              {isSaving
                ? "Saving..."
                : selectedPatient
                ? "Update Patient"
                : "Register Patient"}
            </button>
          </form>
        </div>

        {/* ── Task 4: Enhanced Search — arrow nav + Enter to open ── */}
        {/* ── LAYOUT FIX 3: searchWrap has flexShrink: 0 (preserved via S.searchWrap) ── */}
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>
            <Search size={16} color="#94a3b8" />
          </span>
          <input
            data-testid="patient-search-input"
            className="sakhi-input"
            style={{ ...S.input, paddingLeft: "40px", fontSize: "13.5px" }}
            placeholder="Search patients... (↑↓ navigate, Enter to open)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoComplete="off"
          />
        </div>

        {/* Patient List */}
        {/* ── LAYOUT FIX 4: patientList flex: 1, minHeight: 0, overflowY: auto ── */}
        <PullToRefreshScrollRegion
          data-testid="patient-list"
          className="custom-scroll"
          style={S.patientList}
          onRefresh={async () => {
            await Promise.all([loadPatients(), loadConsultations()]);
          }}
        >
          {(filteredPatients?.length ?? 0) === 0 && (
            <div style={S.emptyList}>
              {searchTerm
                ? `No patients matching "${searchTerm}"`
                : "No patients registered yet."}
            </div>
          )}
          {(filteredPatients || []).map((p, listIndex) => {
            const isActive = String(selectedId) === String(p.id);
            // Task 4: Highlight row focused via keyboard arrow nav
            const isKeyboardFocused = listIndex === focusedIndex;
            return (
              <div
                key={p.id}
                data-testid="patient-row"
                data-patient-id={String(p.id)}
                className={`patient-row ${isActive ? "patient-row-active" : ""} ${isKeyboardFocused ? "patient-row-focused" : ""}`}
                // ─────────────────────────────────────────────────────────
                // FIX 5: Mouse click — String() coercion ensures correct
                // selectedId regardless of source ID type (string vs number).
                // This is the primary mouse-click selection path.
                // ─────────────────────────────────────────────────────────
                onClick={() => {
                  if (p.id != null) syncSelectedId(String(p.id));
                }}
                onMouseEnter={() => setFocusedIndex(listIndex)}
              >
                {isActive && <div style={S.activeBar} />}
                <div
                  style={{
                    ...S.avatar,
                    backgroundColor: isActive ? "#2563eb" : isKeyboardFocused ? "#3b82f6" : "#e2e8f0",
                    color: isActive || isKeyboardFocused ? "#fff" : "#475569",
                    boxShadow: isActive
                      ? "0 4px 12px rgba(37,99,235,0.25)"
                      : isKeyboardFocused
                      ? "0 4px 12px rgba(59,130,246,0.2)"
                      : "none",
                  }}
                >
                  {p.name?.[0]?.toUpperCase() || "P"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.patientName}>{p.name}</div>
                  <div style={S.patientMeta}>
                    <span style={S.idChip}>
                      #{String(p.id || "").slice(-4)}
                    </span>
                    <span style={{ color: "#cbd5e1" }}>&bull;</span>
                    <span>{p.phone || "—"}</span>
                  </div>
                </div>
                <div className="patient-row-actions" style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button
                    type="button"
                    className="sakhi-mini-iconbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                    onClick={(e) => handleEditPatient(e, p.id)}
                    aria-label="Edit patient"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="sakhi-mini-iconbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                    onClick={(e) => handleDeletePatient(e, p.id)}
                    aria-label="Delete patient"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </PullToRefreshScrollRegion>
      </aside>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────── */}
      <ScrollRegion className="custom-scroll" style={{ ...S.rightPanel, padding: isMobile ? "16px" : S.rightPanel.padding }}>
        {!selectedPatient ? (
          <EmptySelect />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

            {/* ── 1. PATIENT HEADER ─────────────────────────────────────── */}
            <div style={S.heroCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "24px", flex: 1 }}>
                <div style={S.heroAvatar}>
                  {selectedPatient.name?.[0]?.toUpperCase() || "P"}
                </div>
                <div style={{ flex: 1 }}>
                  <h1 style={S.heroName}>{selectedPatient.name}</h1>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                    <span style={S.heroPill}>
                      <User size={13} />
                      {selectedPatient.age || "N/A"} Yrs
                    </span>
                    <span style={S.heroPill}>
                      {selectedPatient.gender || "N/A"}
                    </span>
                    <span style={S.heroPill}>
                      <Phone size={13} />
                      {selectedPatient.phone || "N/A"}
                    </span>
                    {(selectedPatient as any).miasm && (
                      <span style={{ ...S.heroPill, background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)" }}>
                        <Brain size={13} />
                        {(selectedPatient as any).miasm}
                      </span>
                    )}
                  </div>
                  {revenueAnalytics.totalPending > 0 && (
                    <div style={S.pendingBanner}>
                      <AlertTriangle size={16} color="#dc2626" />
                      <span>
                        Pending:{" "}
                        <strong>
                          {formatCurrency(revenueAnalytics.totalPending)}
                        </strong>{" "}
                        from previous visits
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                className="hero-consult-btn"
                style={S.heroConsultBtn}
                onClick={() => goToConsultation()}
              >
                <Zap size={16} />
                Start Consultation
              </button>
            </div>

            {/* ── 2. LAST VISIT BANNER ──────────────────────────────────── */}
            {sortedConsultations.length > 0 && (
              <div style={S.lastVisitBanner}>
                <div style={S.lastVisitAccent} />
                <div style={{ padding: "8px", backgroundColor: "#fff", borderRadius: "10px", flexShrink: 0 }}>
                  <Clock size={20} color="#2563eb" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={S.metaLabel}>Last Visit</div>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>
                    {sortedConsultations[0]?.chiefComplaint || "Consultation"}
                    <span style={{ marginLeft: "12px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
                      {sortedConsultations[0]?.date
                        ? new Date(sortedConsultations[0].date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    ...S.outcomeBadge,
                    backgroundColor:
                      sortedConsultations[0]?.outcome === "Improved"
                        ? "#dcfce7"
                        : sortedConsultations[0]?.outcome === "Worse"
                        ? "#fee2e2"
                        : "#f1f5f9",
                    color:
                      sortedConsultations[0]?.outcome === "Improved"
                        ? "#059669"
                        : sortedConsultations[0]?.outcome === "Worse"
                        ? "#991b1b"
                        : "#475569",
                  }}
                >
                  {sortedConsultations[0]?.outcome === "Improved" && <TrendingUp size={13} />}
                  {sortedConsultations[0]?.outcome === "Worse" && <TrendingDown size={13} />}
                  {sortedConsultations[0]?.outcome || "Stable"}
                </span>
              </div>
            )}

            {/* ── 3. SUMMARY STRIP ──────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              <SummaryCard
                icon={<CheckCircle2 size={26} color="#059669" />}
                iconBg="#dcfce7"
                accent="#059669"
                bg="#f0fdf4"
                border="#10b981"
                label="Last Outcome"
                value={sortedConsultations[0]?.outcome || "N/A"}
              />
              <SummaryCard
                icon={<HistoryIcon size={26} color="#4f46e5" />}
                iconBg="#c7d2fe"
                accent="#4f46e5"
                bg="#eef2ff"
                border="#6366f1"
                label="Total Visits"
                value={String(patientConsultations.length)}
              />
              <SummaryCard
                icon={<Brain size={26} color="#d97706" />}
                iconBg="#fde68a"
                accent="#d97706"
                bg="#fffbeb"
                border="#f59e0b"
                label="Dominant Miasm"
                value={(selectedPatient as any)?.miasm || "Psora"}
              />
            </div>

            {/* ── 4. RISK ALERTS ────────────────────────────────────────── */}
            {healingTrend === "Suppressed" && (
              <div style={S.alertRed} className="pulse-soft">
                <div style={{ ...S.alertIcon, background: "#fee2e2" }}>
                  <ShieldAlert size={28} color="#dc2626" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#991b1b", fontSize: "15px", marginBottom: "4px" }}>
                    HIGH RISK — Suppression Detected
                  </div>
                  <div style={{ color: "#b91c1c", fontSize: "13.5px", lineHeight: 1.6 }}>
                    Review Hering's Law alignment and case approach immediately.
                    Last outcome indicates potential therapeutic mismanagement.
                  </div>
                </div>
              </div>
            )}

            {/* ── 5. TAB NAVIGATION ─────────────────────────────────────── */}
            {patientConsultations.length > 0 && (
              <>
                <div style={S.tabBar}>
                  {(["overview", "history", "finance"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        ...S.tabBtn,
                        ...(activeTab === tab ? S.tabBtnActive : {}),
                      }}
                    >
                      {tab === "overview" && <BarChart3 size={15} />}
                      {tab === "history" && <HistoryIcon size={15} />}
                      {tab === "finance" && <Receipt size={15} />}
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* ── TAB: OVERVIEW ─────────────────────────────────────── */}
                {activeTab === "overview" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={S.card}>
                      <SectionTitle icon={<BarChart3 size={18} color="#6366f1" />} label="Miasmatic Mapping" />
                      <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "8px" }}>
                        {Object.entries(miasmAnalytics).map(([miasm, count]) => {
                          const total = patientConsultations.length || 1;
                          const pct = Math.round((count / total) * 100);
                          const colors: Record<string, string> = { Psora: "#10b981", Sycosis: "#f59e0b", Syphilis: "#ef4444" };
                          return (
                            <div key={miasm}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13.5px", fontWeight: 600, color: "#475569" }}>
                                <span>{miasm}</span>
                                <span style={{ color: "#0f172a", fontWeight: 700 }}>
                                  {count} session{count !== 1 ? "s" : ""} &bull; {pct}%
                                </span>
                              </div>
                              <div style={S.barTrack}>
                                <div style={{ ...S.barFill, width: `${pct}%`, backgroundColor: colors[miasm] }} />
                              </div>
                            </div>
                          );
                        })}
                        <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#94a3b8", textAlign: "center", fontStyle: "italic" }}>
                          Based on {patientConsultations.length} recorded session{patientConsultations.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div style={S.card}>
                      <SectionTitle icon={<TrendingUp size={18} color="#10b981" />} label="Healing Direction" />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "12px" }}>
                        <div
                          style={{
                            padding: "20px",
                            borderRadius: "14px",
                            background: healingTrend === "Healing" ? "#f0fdf4" : healingTrend === "Suppressed" ? "#fef2f2" : "#fffbeb",
                            border: `1.5px solid ${healingTrend === "Healing" ? "#10b981" : healingTrend === "Suppressed" ? "#ef4444" : "#f59e0b"}`,
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "10px", letterSpacing: "0.5px" }}>Healing Trend</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "18px", fontWeight: 900, color: healingTrend === "Healing" ? "#059669" : healingTrend === "Suppressed" ? "#991b1b" : "#d97706" }}>
                            {healingTrend === "Healing" ? <TrendingUp size={22} /> : healingTrend === "Suppressed" ? <ShieldAlert size={22} /> : <TrendingDown size={22} />}
                            {healingTrend}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: "20px",
                            borderRadius: "14px",
                            background: sortedConsultations[0]?.heringsLawMatch ? "#f0fdf4" : "#fef3c7",
                            border: `1.5px solid ${sortedConsultations[0]?.heringsLawMatch ? "#10b981" : "#f59e0b"}`,
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "10px", letterSpacing: "0.5px" }}>Hering's Law</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "18px", fontWeight: 900, color: sortedConsultations[0]?.heringsLawMatch ? "#059669" : "#d97706" }}>
                            <CheckCircle2 size={22} />
                            {sortedConsultations[0]?.heringsLawMatch ? "Matched" : "Review"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RC1 Patient Ledger: Reminder Sent/Date/Count/Notes -- reuses
                        reminderQueueService.ts's own queue records. */}
                    <div style={S.card}>
                      <SectionTitle icon={<MessageCircle size={18} color="#0891b2" />} label={`Reminder History — ${patientReminders.length} Reminder${patientReminders.length !== 1 ? "s" : ""}`} />
                      {patientReminders.length === 0 ? (
                        <p style={{ margin: "12px 0 0", fontSize: "13px", color: "#94a3b8" }}>No reminders sent to this patient yet.</p>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginTop: "12px" }}>
                            <FinanceCard
                              label="Reminder Sent"
                              amount={undefined}
                              color={patientReminders.some((r) => r.status === "sent") ? "#059669" : "#94a3b8"}
                              display={patientReminders.some((r) => r.status === "sent") ? "Yes" : "Not yet"}
                            />
                            <FinanceCard
                              label="Last Reminder"
                              amount={undefined}
                              color="#0f172a"
                              display={new Date(patientReminders[0].updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            />
                            <FinanceCard label="Reminder Count" amount={undefined} color="#0891b2" display={String(patientReminders.length)} />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
                            {patientReminders.slice(0, 5).map((r) => (
                              <div key={r.id} style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>{new Date(r.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} &bull; {r.type.replace(/_/g, " ")}</span>
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      fontWeight: 800,
                                      padding: "2px 8px",
                                      borderRadius: "999px",
                                      textTransform: "uppercase",
                                      backgroundColor: r.status === "sent" ? "#dcfce7" : r.status === "failed" || r.status === "rejected" ? "#fee2e2" : "#fef3c7",
                                      color: r.status === "sent" ? "#166534" : r.status === "failed" || r.status === "rejected" ? "#991b1b" : "#92400e",
                                    }}
                                  >
                                    {r.status}
                                  </span>
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b", whiteSpace: "pre-line" }}>{r.message}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB: HISTORY ──────────────────────────────────────── */}
                {activeTab === "history" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <SectionTitle icon={<HistoryIcon size={18} color="#2563eb" />} label={`Longitudinal History — ${sortedConsultations.length} Visit${sortedConsultations.length !== 1 ? "s" : ""}`} />
                    {sortedConsultations.map((c, i) => (
                      <div
                        key={c.id || i}
                        className="timeline-card"
                        style={{
                          ...S.timelineCard,
                          background: getOutcomeBg(c.outcome),
                          borderColor: getOutcomeBorder(c.outcome),
                        }}
                        onClick={() => handleTimelineClick(c.id || "")}
                      >
                        <div style={{ ...S.timelineAccent, background: getOutcomeColor(c.outcome) }} />
                        <div style={S.timelineDateBlock}>
                          <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>
                            {c.date ? new Date(c.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "N/A"}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                            {c.date ? new Date(c.date).getFullYear() : ""}
                          </div>
                          <span style={S.visitChip}>VISIT {sortedConsultations.length - i}</span>
                        </div>
                        <div style={{ flex: 1, paddingLeft: "20px", borderLeft: "1px dashed #e2e8f0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                            <div style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b", marginBottom: "8px" }}>
                              {c.chiefComplaint || "Consultation Record"}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                              <span
                                style={{
                                  ...S.outcomeBadge,
                                  backgroundColor: getOutcomeBg(c.outcome),
                                  color: getOutcomeColor(c.outcome),
                                  border: `1px solid ${getOutcomeBorder(c.outcome)}`,
                                }}
                              >
                                {c.outcome === "Improved" && <TrendingUp size={12} />}
                                {(c.outcome === "Worse" || c.outcome === "NewSymptoms") && <TrendingDown size={12} />}
                                {c.outcome || "Neutral"}
                              </span>
                              <span style={S.miasmChip}>{c.miasm || "Psora"} Base</span>
                              {c.fee && c.fee > 0 && (
                                <span style={S.feeChip}>&#8377;{c.fee}</span>
                              )}
                              {c.paymentStatus && (
                                <span
                                  style={{
                                    ...S.paymentChip,
                                    backgroundColor: getPaymentStatusStyle(c.paymentStatus).bg,
                                    color: getPaymentStatusStyle(c.paymentStatus).color,
                                    border: `1px solid ${getPaymentStatusStyle(c.paymentStatus).border}`,
                                  }}
                                >
                                  {c.paymentStatus.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          {c.caseText && (
                            <div style={S.caseTextBlock}>
                              &ldquo;{c.caseText.slice(0, 180)}{c.caseText.length > 180 ? "…" : ""}&rdquo;
                            </div>
                          )}
                          {Array.isArray(c.medicines) && c.medicines.length > 0 && (
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px", alignItems: "center" }}>
                              <span style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Rx:</span>
                              {c.medicines.map((med, idx) => (
                                <span key={idx} style={S.remedyChip}>
                                  <Zap size={12} color="#2563eb" />
                                  {med.name}
                                  {med.dosage && <span style={{ color: "#64748b", fontWeight: 500 }}>{" "}{med.dosage}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          style={S.timelineArrow}
                          className="timeline-arrow"
                          onClick={(e) => { e.stopPropagation(); handleTimelineClick(c.id || ""); }}
                          title="Open consultation"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── TAB: FINANCE ──────────────────────────────────────── */}
                {activeTab === "finance" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                      <FinanceCard label="Total Billed" amount={revenueAnalytics.totalBilled} color="#0f172a" />
                      <FinanceCard label="Total Paid" amount={revenueAnalytics.totalPaid} color="#059669" />
                      <FinanceCard label="Total Pending" amount={revenueAnalytics.totalPending} color={revenueAnalytics.totalPending > 0 ? "#dc2626" : "#059669"} />
                    </div>
                    {revenueAnalytics.lastPayment && (
                      <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                        <div>
                          <div style={S.metaLabel}>Last Payment Received</div>
                          <div style={{ fontWeight: 700, fontSize: "16px", color: "#059669" }}>
                            {formatCurrency(revenueAnalytics.lastPayment.amount)}
                          </div>
                        </div>
                        <div style={{ color: "#64748b", fontSize: "14px", fontWeight: 600 }}>
                          {new Date(revenueAnalytics.lastPayment.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      </div>
                    )}
                    {revenueAnalytics.totalPending > 0 && (
                      <div style={S.paymentAlert}>
                        <div style={{ ...S.alertIcon, background: "#fde68a" }}>
                          <AlertTriangle size={22} color="#d97706" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: "#92400e", marginBottom: "4px", fontSize: "14px" }}>Pending Payment</div>
                          <div style={{ color: "#92400e", fontSize: "13px" }}>
                            {formatCurrency(revenueAnalytics.totalPending)} outstanding for {selectedPatient.name}
                          </div>
                        </div>
                        <button style={S.whatsappBtn} className="sakhi-btn-whatsapp" onClick={handleSendReminder}>
                          <MessageCircle size={15} />
                          Remind on WhatsApp
                        </button>
                      </div>
                    )}
                    <div style={S.card}>
                      <SectionTitle icon={<Receipt size={18} color="#d97706" />} label="Payment History" />
                      <div style={{ overflowX: "auto", marginTop: "16px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                              {["Date", "Fee", "Status", "Mode", "Reference", "Notes", "Proof"].map((h) => (
                                <th key={h} style={S.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedConsultations
                              .filter((c) => c.fee && c.fee > 0)
                              .map((c, i) => {
                                const statusStyle = getPaymentStatusStyle(c.paymentStatus);
                                return (
                                  <tr key={c.id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={S.td}>
                                      {c.date ? new Date(c.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                    </td>
                                    <td style={{ ...S.td, fontWeight: 700, color: "#0f172a" }}>
                                      {c.paymentStatus === "partial"
                                        ? `${formatCurrency(c.amountReceived)} / ${formatCurrency(c.fee)}`
                                        : formatCurrency(c.fee)}
                                    </td>
                                    <td style={S.td}>
                                      <span
                                        style={{
                                          padding: "4px 10px",
                                          borderRadius: "6px",
                                          fontSize: "11.5px",
                                          fontWeight: 700,
                                          backgroundColor: statusStyle.bg,
                                          color: statusStyle.color,
                                        }}
                                      >
                                        {(c.paymentStatus || "pending").toUpperCase()}
                                      </span>
                                    </td>
                                    <td style={{ ...S.td, color: "#64748b" }}>
                                      {c.paymentMode ? c.paymentMode.replace("_", " ").toUpperCase() : "—"}
                                    </td>
                                    <td style={{ ...S.td, color: "#64748b", fontSize: "12.5px" }}>
                                      {c.paymentReferenceNumber || "—"}
                                    </td>
                                    <td style={{ ...S.td, color: "#64748b", fontSize: "12.5px", maxWidth: 160 }}>
                                      {c.paymentNotes || "—"}
                                    </td>
                                    <td style={S.td}>
                                      {c.paymentScreenshotDataUrl ? (
                                        <button
                                          type="button"
                                          data-testid={`payment-proof-view-${c.id || i}`}
                                          onClick={() => setViewingScreenshot({ dataUrl: c.paymentScreenshotDataUrl!, date: c.date })}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                            padding: "4px 10px",
                                            borderRadius: "6px",
                                            border: "1px solid #bfdbfe",
                                            background: "#eff6ff",
                                            color: "#1d4ed8",
                                            fontSize: "11.5px",
                                            fontWeight: 700,
                                            cursor: "pointer",
                                          }}
                                        >
                                          <Eye size={12} /> View
                                        </button>
                                      ) : (
                                        <span style={{ color: "#cbd5e1" }}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            {sortedConsultations.filter((c) => c.fee && c.fee > 0).length === 0 && (
                              <tr>
                                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "15px" }}>
                                  No payment records found
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── FIRST VISIT PROMPT ─────────────────────────────────────── */}
            {patientConsultations.length === 0 && (
              <div style={S.firstVisitCard}>
                <div style={S.firstVisitIcon}>
                  <Clock size={48} color="#2563eb" strokeWidth={1.5} />
                </div>
                <h3 style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a", marginBottom: "12px" }}>
                  Ready for First Consultation
                </h3>
                <p style={{ color: "#64748b", fontSize: "15px", lineHeight: 1.8, maxWidth: "440px", marginBottom: "28px" }}>
                  Begin <strong>{selectedPatient.name}</strong>'s clinical journey.
                  Record their full case totality, prescribe the simillimum, and
                  track their healing progression over time.
                </p>
                <button
                  className="sakhi-btn-primary"
                  style={{ ...S.btnPrimary, padding: "16px 40px", fontSize: "15px" }}
                  onClick={() => goToConsultation()}
                >
                  <Zap size={18} />
                  Start First Consultation
                </button>
              </div>
            )}

            {/* ── REPORTS ───────────────────────────────────────────────── */}
            <div style={S.card}>
              <SectionTitle icon={<Receipt size={18} color="#64748b" />} label="Lab Reports" />
              <div style={{ marginTop: "14px" }}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleReportUpload}
                  style={{ fontSize: "13px", color: "#64748b" }}
                />
                {reports.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "12px" }}>No reports uploaded yet.</p>
                ) : (
                  <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {reports.map((r) => (
                      <div
                        key={r.id}
                        style={S.reportItem}
                        onClick={() => window.open(r.fileUrl, "_blank")}
                        className="report-item"
                      >
                        <Receipt size={14} color="#64748b" />
                        <span>{r.name}</span>
                        <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94a3b8" }}>
                          {new Date(r.uploadedAt).toLocaleDateString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ScrollRegion>
    </SplitPane>
    {viewingScreenshot && (
      <PaymentScreenshotViewer
        dataUrl={viewingScreenshot.dataUrl}
        date={viewingScreenshot.date}
        patientName={selectedPatient?.name || "Patient"}
        onClose={() => setViewingScreenshot(null)}
      />
    )}
    </>
  );
}

// ─── Small Sub-components ─────────────────────────────────────────────────────

function SummaryCard({ icon, iconBg, accent, bg, border, label, value }: {
  icon: React.ReactNode; iconBg: string; accent: string; bg: string; border: string; label: string; value: string;
}) {
  return (
    <div className="summary-card" style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: "18px", padding: "22px", display: "flex", alignItems: "center", gap: "16px", position: "relative", overflow: "hidden", boxShadow: "0 2px 12px rgba(15,23,42,0.03)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: accent }} />
      <div style={{ padding: "10px", backgroundColor: iconBg, borderRadius: "12px" }}>{icon}</div>
      <div>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>{label}</div>
        <div style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>{value}</div>
      </div>
    </div>
  );
}

/** `display` overrides the default currency formatting for non-money
 * stats (e.g. Reminder History's "Yes"/date/count) that otherwise want
 * the exact same card layout. */
function FinanceCard({ label, amount, color, display }: { label: string; amount?: number; color: string; display?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", textAlign: "center", boxShadow: "0 2px 8px rgba(15,23,42,0.03)" }}>
      <div style={{ fontSize: "22px", fontWeight: 900, color, marginBottom: "6px" }}>{display ?? formatCurrency(amount)}</div>
      <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
      <div style={{ padding: "6px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>{icon}</div>
      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{label}</h3>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "var(--surface-muted)",
    minHeight: 0,
  } as React.CSSProperties,
  leftPanel: {
    width: "320px",
    minWidth: "320px",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "var(--surface)",
    borderRight: "1px solid var(--border)",
  } as React.CSSProperties,
  rightPanel: {
    flex: 1,
    overflowY: "auto",
    padding: "var(--space-5)",
    backgroundColor: "var(--surface-muted)",
    minHeight: 0,
  } as React.CSSProperties,
  // ── LAYOUT FIX 2: formHeader — capped at 52vh, internally scrollable, never flexShrinks ──
  formHeader: {
    padding: "var(--space-4) var(--space-3) var(--space-3)",
    borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
    flexShrink: 0,
    maxHeight: "52vh",
    overflowY: "auto",
  } as React.CSSProperties,
  formTitleRow: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" } as React.CSSProperties,
  formIconWrap: { padding: "7px", backgroundColor: "rgba(37, 99, 235, 0.08)", borderRadius: "var(--radius-2)", flexShrink: 0 } as React.CSSProperties,
  formSectionLabel: { fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "1px" } as React.CSSProperties,
  formTitle: { fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 } as React.CSSProperties,
  clearBtn: { marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", borderRadius: "6px", display: "flex", alignItems: "center" } as React.CSSProperties,
  input: { width: "100%", minWidth: 0 } as React.CSSProperties,
  btnPrimary: { width: "100%" } as React.CSSProperties,
  // ── LAYOUT FIX 3: searchWrap — flexShrink: 0 ensures it never collapses ──
  searchWrap: {
    padding: "var(--space-2) var(--space-3)",
    borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
    position: "relative",
    flexShrink: 0,
  } as React.CSSProperties,
  searchIcon: { position: "absolute", left: "28px", top: "50%", transform: "translateY(-50%)" } as React.CSSProperties,
  // ── LAYOUT FIX 4: patientList — flex: 1 + minHeight: 0 makes it fill remaining space and scroll independently ──
  patientList: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "8px 0",
  } as React.CSSProperties,
  emptyList: { padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" } as React.CSSProperties,
  activeBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: "3px", backgroundColor: "#2563eb", borderRadius: "3px" } as React.CSSProperties,
  avatar: { width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "15px", transition: "all 0.2s ease", flexShrink: 0 } as React.CSSProperties,
  patientName: { fontWeight: 700, color: "#1e293b", fontSize: "14px", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", marginBottom: "3px" } as React.CSSProperties,
  patientMeta: { fontSize: "11.5px", color: "#64748b", display: "flex", gap: "6px", alignItems: "center" } as React.CSSProperties,
  idChip: { fontFamily: "monospace", backgroundColor: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", fontSize: "10.5px", fontWeight: 700 } as React.CSSProperties,
  heroCard: { background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", borderRadius: "20px", padding: "32px 36px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px", border: "none", boxShadow: "0 16px 40px -8px rgba(37,99,235,0.3)" } as React.CSSProperties,
  heroAvatar: { width: "76px", height: "76px", borderRadius: "20px", backgroundColor: "#fff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: 900, flexShrink: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" } as React.CSSProperties,
  heroName: { fontSize: "30px", fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.5px" } as React.CSSProperties,
  heroPill: { display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: "rgba(255,255,255,0.15)", color: "#fff", padding: "6px 12px", borderRadius: "8px", backdropFilter: "blur(10px)", fontSize: "13px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)" } as React.CSSProperties,
  pendingBanner: { marginTop: "14px", padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "#dc2626", fontWeight: 600, width: "fit-content" } as React.CSSProperties,
  heroConsultBtn: { padding: "13px 24px", fontSize: "14px", fontWeight: 700, background: "#fff", color: "#2563eb", border: "none", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 8px 20px rgba(0,0,0,0.12)", flexShrink: 0, transition: "all 0.2s ease" } as React.CSSProperties,
  lastVisitBanner: { background: "#f0f9ff", border: "1.5px solid #bfdbfe", borderRadius: "16px", padding: "18px 22px", display: "flex", alignItems: "center", gap: "16px", position: "relative" as const, overflow: "hidden" } as React.CSSProperties,
  lastVisitAccent: { position: "absolute" as const, top: 0, left: 0, bottom: 0, width: "4px", backgroundColor: "#2563eb" } as React.CSSProperties,
  card: { background: "#fff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 2px 12px rgba(15,23,42,0.03)" } as React.CSSProperties,
  tabBar: { display: "flex", gap: "6px", backgroundColor: "#f1f5f9", padding: "5px", borderRadius: "14px", width: "fit-content" } as React.CSSProperties,
  tabBtn: { padding: "9px 18px", borderRadius: "10px", border: "none", background: "transparent", color: "#64748b", fontWeight: 600, fontSize: "13.5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", transition: "all 0.2s ease" } as React.CSSProperties,
  tabBtnActive: { backgroundColor: "#fff", color: "#0f172a", fontWeight: 800, boxShadow: "0 2px 8px rgba(15,23,42,0.08)" } as React.CSSProperties,
  alertRed: { background: "#fef2f2", border: "2px solid #fecaca", borderRadius: "16px", padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: "16px" } as React.CSSProperties,
  alertIcon: { padding: "10px", borderRadius: "50%", flexShrink: 0 } as React.CSSProperties,
  metaLabel: { fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "4px" } as React.CSSProperties,
  outcomeBadge: { display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "8px", fontSize: "12px", fontWeight: 700 } as React.CSSProperties,
  barTrack: { height: "8px", backgroundColor: "#f1f5f9", borderRadius: "8px", overflow: "hidden" } as React.CSSProperties,
  barFill: { height: "100%", borderRadius: "8px", transition: "width 0.8s ease" } as React.CSSProperties,
  timelineCard: { borderRadius: "16px", border: "1px solid #e2e8f0", padding: "22px 22px 22px 26px", display: "flex", gap: "0", cursor: "pointer", position: "relative" as const, overflow: "hidden", transition: "all 0.2s ease", backgroundColor: "#fff" } as React.CSSProperties,
  timelineAccent: { position: "absolute" as const, left: 0, top: 0, bottom: 0, width: "5px", borderRadius: "16px 0 0 16px" } as React.CSSProperties,
  timelineDateBlock: { minWidth: "90px", paddingRight: "20px", display: "flex", flexDirection: "column" as const, justifyContent: "flex-start", gap: "4px", flexShrink: 0 } as React.CSSProperties,
  visitChip: { marginTop: "10px", fontSize: "10px", fontWeight: 800, color: "#2563eb", background: "#eff6ff", padding: "3px 7px", borderRadius: "5px", border: "1px solid #bfdbfe", display: "inline-block", width: "fit-content" } as React.CSSProperties,
  miasmChip: { fontSize: "11px", fontWeight: 700, backgroundColor: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: "5px" } as React.CSSProperties,
  feeChip: { fontSize: "11px", fontWeight: 700, backgroundColor: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "5px", border: "1px solid #fde68a" } as React.CSSProperties,
  paymentChip: { fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "5px" } as React.CSSProperties,
  caseTextBlock: { marginTop: "10px", padding: "10px 14px", backgroundColor: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: "10px", fontSize: "13.5px", color: "#475569", fontStyle: "italic", lineHeight: 1.6 } as React.CSSProperties,
  remedyChip: { display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px", backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", fontWeight: 700, color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" } as React.CSSProperties,
  timelineArrow: { padding: "8px", color: "#94a3b8", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", flexShrink: 0, alignSelf: "center" as const, marginLeft: "12px" } as React.CSSProperties,
  paymentAlert: { background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: "14px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px" } as React.CSSProperties,
  whatsappBtn: { backgroundColor: "#16a34a", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", flexShrink: 0, transition: "all 0.2s ease", boxShadow: "0 4px 12px rgba(22,163,74,0.2)" } as React.CSSProperties,
  th: { padding: "12px 14px", textAlign: "left" as const, fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.5px" } as React.CSSProperties,
  td: { padding: "14px", fontSize: "13.5px", color: "#475569", fontWeight: 600 } as React.CSSProperties,
  firstVisitCard: { background: "#fff", border: "2px dashed #bfdbfe", borderRadius: "20px", padding: "60px 40px", display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const, boxShadow: "0 4px 20px rgba(37,99,235,0.05)" } as React.CSSProperties,
  firstVisitIcon: { width: "100px", height: "100px", backgroundColor: "#dbeafe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "28px", border: "2px solid #93c5fd", boxShadow: "0 8px 24px rgba(37,99,235,0.1)" } as React.CSSProperties,
  reportItem: { padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13.5px", fontWeight: 600, color: "#334155", transition: "background 0.15s ease" } as React.CSSProperties,
  // ✅ V43: Collapsible section styles
  collapsibleSection: { border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px 12px", backgroundColor: "#f8fafc" } as React.CSSProperties,
  collapsibleHeader: { width: "100%", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 } as React.CSSProperties,
  collapsibleLabel: { fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.5px" } as React.CSSProperties,
};

const CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.88; } }
  .custom-scroll::-webkit-scrollbar { width: 5px; }
  .custom-scroll::-webkit-scrollbar-track { background: transparent; }
  .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
  .custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  .sakhi-input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; background-color: #ffffff !important; outline: none; }
  .sakhi-btn-primary:hover { background-color: #1e3a8a !important; transform: translateY(-1px); }
  .sakhi-btn-whatsapp:hover { background-color: #15803d !important; transform: translateY(-1px); }
  .hero-consult-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.16) !important; }
  .patient-row { position: relative; padding: 10px 12px; margin: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 12px; border-radius: 14px; transition: all 0.15s ease; border: 1px solid rgba(226,232,240,0.9); background: rgba(255,255,255,0.92); box-shadow: 0 1px 0 rgba(15,23,42,0.03) inset; }
  .patient-row:hover { background-color: rgba(2, 6, 23, 0.02); border-color: rgba(148, 163, 184, 0.55); }
  .patient-row-active { background-color: rgba(13, 115, 119, 0.05) !important; border-color: rgba(13, 115, 119, 0.25) !important; }
  .patient-row-focused { background-color: rgba(2, 6, 23, 0.02) !important; border-color: rgba(148, 163, 184, 0.55) !important; outline: none; }
  .patient-row-actions .sakhi-mini-iconbtn { flex: 0 0 auto; }
  .summary-card { transition: all 0.2s ease; }
  .summary-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,42,0.06) !important; }
  .timeline-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(15,23,42,0.08) !important; }
  .timeline-arrow:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
  .pulse-soft { animation: pulse-soft 2.5s ease-in-out infinite; }
  .report-item:hover { background-color: #f1f5f9 !important; }
  .spin { animation: spin 0.8s linear infinite; }
`;
