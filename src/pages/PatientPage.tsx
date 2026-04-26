import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UserPlus,
  Search,
  Phone,
  User,
  History as HistoryIcon,
  Brain,
  ShieldAlert,
  ChevronRight,
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
  X,
} from "lucide-react";
import { usePatientStore } from "../store/usePatientStore";
import { useConsultationStore } from "../store/useConsultationStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Report {
  id: string;
  name: string;
  fileUrl: string;
  uploadedAt: string;
}

interface FormData {
  name: string;
  age: string;
  gender: string;
  phone: string;
  address: string;
  referredBy: string;
  referredTo: string;
  miasm: string;
}

// Typed consultation shape — aligned with ConsultationStore payload
interface Consultation {
  id?: string;
  patientId: string;
  date: string;
  chiefComplaint?: string;
  caseText?: string;
  outcome?: string;
  miasm?: string;
  medicines?: { name: string; dosage?: string; duration?: string }[];
  fee?: number;
  paymentStatus?: "paid" | "pending";
  paymentMode?: "cash" | "upi" | "card";
  // FIXED: Added heringsLawMatch — matches db.ts Consultation schema
  heringsLawMatch?: boolean;
}

interface PatientPageProps {
  goToConsultation?: (patientId: string, appointmentId: string) => void;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        flexDirection: "column",
        gap: "16px",
        background: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: "44px",
          height: "44px",
          border: "4px solid #e2e8f0",
          borderTop: "4px solid #2563eb",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ color: "#64748b", fontWeight: 600, margin: 0 }}>
        Loading Patients...
      </p>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientPage(
  props: PatientPageProps = {}
): React.ReactElement {
  // ── Stores ───────────────────────────────────────────────────────────────
  const patients = usePatientStore((state) => state.patients) || [];
  const { loadPatients, addPatient, updatePatient, deletePatient } =
    usePatientStore();
  const rawConsultations = useConsultationStore(
    (state) => state.consultations
  ) || [];
  const consultations = rawConsultations as Consultation[];
  const { loadConsultations } = useConsultationStore();

  // ── Local State ──────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "finance">("overview");

  const defaultForm: FormData = {
    name: "",
    age: "",
    gender: "Male",
    phone: "",
    address: "",
    referredBy: "",
    referredTo: "",
    miasm: "Psora",
  };
  const [formData, setFormData] = useState<FormData>(defaultForm);

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

  // ── Derived Data ─────────────────────────────────────────────────────────
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedId) || null,
    [selectedId, patients]
  );

  const patientConsultations = useMemo(
    () => consultations.filter((c) => c.patientId === selectedId),
    [consultations, selectedId]
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

  const revenueAnalytics = useMemo(() => {
    const paidConsults = patientConsultations.filter(
      (c) => c.fee && c.fee > 0 && c.paymentStatus === "paid"
    );
    const pendingConsults = patientConsultations.filter(
      (c) => c.fee && c.fee > 0 && c.paymentStatus === "pending"
    );

    const totalPaid = paidConsults.reduce((sum, c) => sum + (c.fee || 0), 0);
    const totalPending = pendingConsults.reduce(
      (sum, c) => sum + (c.fee || 0),
      0
    );
    const totalBilled = totalPaid + totalPending;

    const lastPaid =
      paidConsults.length > 0
        ? paidConsults.reduce((a, b) =>
            new Date(a.date) > new Date(b.date) ? a : b
          )
        : null;

    return {
      totalPaid,
      totalPending,
      totalBilled,
      lastPayment: lastPaid
        ? { amount: lastPaid.fee, date: lastPaid.date }
        : null,
    };
  }, [patientConsultations]);

  const filteredPatients = useMemo(
    () =>
      patients.filter((p) =>
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [patients, searchTerm]
  );

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
      });
      setReports((selectedPatient as any).reports || []);
    } else {
      setFormData(defaultForm);
      setReports([]);
    }
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

    setIsSaving(true);
    try {
      if (selectedPatient) {
        await updatePatient(selectedPatient.id, {
          ...formData,
          reports: reports as any,
        });
      } else {
        await addPatient({
          ...formData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          reports: reports as any,
        } as any);
      }
      setFormData(defaultForm);
      setReports([]);
      setSelectedId(null);
    } catch (error) {
      console.error("Error saving patient:", error);
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
      await deletePatient(id);
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      console.error("Error deleting patient:", error);
      alert("Error deleting patient. Please try again.");
    }
  };

  const handleEditPatient = useCallback(
    (e: React.MouseEvent, patientId: string) => {
      e.stopPropagation();
      setSelectedId(patientId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    []
  );

  const handleReportUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newReport: Report = {
      id: Date.now().toString(),
      name: file.name,
      fileUrl: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
    };
    setReports((prev) => [...prev, newReport]);
  };

  const handleSendReminder = useCallback((): void => {
    if (!selectedPatient) return;
    const message = `Dear ${selectedPatient.name}, this is a reminder from Sakhi Homeopathic Clinic. You have a pending payment of ${formatCurrency(revenueAnalytics.totalPending)}. Please visit us to clear the balance. Thank you!`;
    const phone = selectedPatient.phone?.replace(/\D/g, "") || "";
    window.open(
      `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
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
    <div style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
      <aside style={S.leftPanel}>
        {/* Registration Form */}
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
                onClick={() => setSelectedId(null)}
                title="Cancel edit"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <form
            onSubmit={handleAdd}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <input
              className="sakhi-input"
              style={S.input}
              placeholder="Full Name *"
              value={formData.name}
              onChange={(e) => handleFormChange("name", e.target.value)}
              required
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                className="sakhi-input"
                style={{ ...S.input, flex: 1 }}
                placeholder="Age"
                value={formData.age}
                onChange={(e) => handleFormChange("age", e.target.value)}
              />
              <select
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

        {/* Search */}
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>
            <Search size={16} color="#94a3b8" />
          </span>
          <input
            className="sakhi-input"
            style={{ ...S.input, paddingLeft: "40px", fontSize: "13.5px" }}
            placeholder="Search patients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Patient List */}
        <div className="custom-scroll" style={S.patientList}>
          {filteredPatients.length === 0 && (
            <div style={S.emptyList}>
              {searchTerm
                ? `No patients matching "${searchTerm}"`
                : "No patients registered yet."}
            </div>
          )}
          {filteredPatients.map((p) => {
            const isActive = selectedId === p.id;
            return (
              <div
                key={p.id}
                className={`patient-row ${isActive ? "patient-row-active" : ""}`}
                onClick={() => setSelectedId(p.id)}
              >
                {isActive && <div style={S.activeBar} />}
                <div
                  style={{
                    ...S.avatar,
                    backgroundColor: isActive ? "#2563eb" : "#e2e8f0",
                    color: isActive ? "#fff" : "#475569",
                    boxShadow: isActive
                      ? "0 4px 12px rgba(37,99,235,0.25)"
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
                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                  <button
                    className="action-btn edit-btn"
                    onClick={(e) => handleEditPatient(e, p.id)}
                  >
                    Edit
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={(e) => handleDeletePatient(e, p.id)}
                  >
                    Del
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────── */}
      <main className="custom-scroll" style={S.rightPanel}>
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
                    {/* Miasm mapping */}
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

                    {/* Healing trend */}
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

                        {/* FIXED: heringsLawMatch now typed in local Consultation interface */}
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
                                    backgroundColor: c.paymentStatus === "paid" ? "#dcfce7" : "#fef3c7",
                                    color: c.paymentStatus === "paid" ? "#166534" : "#92400e",
                                    border: `1px solid ${c.paymentStatus === "paid" ? "#86efac" : "#fde68a"}`,
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
                              {["Date", "Fee", "Status", "Mode"].map((h) => (
                                <th key={h} style={S.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedConsultations
                              .filter((c) => c.fee && c.fee > 0)
                              .map((c, i) => (
                                <tr key={c.id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={S.td}>
                                    {c.date ? new Date(c.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                  </td>
                                  <td style={{ ...S.td, fontWeight: 700, color: "#0f172a" }}>{formatCurrency(c.fee)}</td>
                                  <td style={S.td}>
                                    <span
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: "6px",
                                        fontSize: "11.5px",
                                        fontWeight: 700,
                                        backgroundColor: c.paymentStatus === "paid" ? "#dcfce7" : "#fef3c7",
                                        color: c.paymentStatus === "paid" ? "#166534" : "#92400e",
                                      }}
                                    >
                                      {(c.paymentStatus || "pending").toUpperCase()}
                                    </span>
                                  </td>
                                  <td style={{ ...S.td, color: "#64748b" }}>
                                    {c.paymentMode ? c.paymentMode.toUpperCase() : "—"}
                                  </td>
                                </tr>
                              ))}
                            {sortedConsultations.filter((c) => c.fee && c.fee > 0).length === 0 && (
                              <tr>
                                <td colSpan={4} style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "15px" }}>
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
      </main>
    </div>
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

function FinanceCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", textAlign: "center", boxShadow: "0 2px 8px rgba(15,23,42,0.03)" }}>
      <div style={{ fontSize: "22px", fontWeight: 900, color, marginBottom: "6px" }}>{formatCurrency(amount)}</div>
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
  page: { display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "#f4f7f9", fontFamily: "system-ui, -apple-system, sans-serif" } as React.CSSProperties,
  leftPanel: { width: "300px", backgroundColor: "#ffffff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflowY: "hidden", flexShrink: 0, boxShadow: "2px 0 16px rgba(0,0,0,0.025)" } as React.CSSProperties,
  rightPanel: { flex: 1, overflowY: "auto", padding: "36px 44px", backgroundColor: "#f8fafc" } as React.CSSProperties,
  formHeader: { padding: "24px 20px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 } as React.CSSProperties,
  formTitleRow: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" } as React.CSSProperties,
  formIconWrap: { padding: "7px", backgroundColor: "#eff6ff", borderRadius: "8px", flexShrink: 0 } as React.CSSProperties,
  formSectionLabel: { fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "1px" } as React.CSSProperties,
  formTitle: { fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 } as React.CSSProperties,
  clearBtn: { marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", borderRadius: "6px", display: "flex", alignItems: "center" } as React.CSSProperties,
  input: { width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", outline: "none", backgroundColor: "#f8fafc", color: "#0f172a", boxSizing: "border-box" as const } as React.CSSProperties,
  btnPrimary: { backgroundColor: "#1e40af", color: "#ffffff", padding: "12px 16px", borderRadius: "10px", border: "none", fontWeight: 700, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s ease", boxShadow: "0 4px 12px rgba(30,64,175,0.2)", width: "100%" } as React.CSSProperties,
  searchWrap: { padding: "14px 16px", borderBottom: "1px solid #f1f5f9", position: "relative", flexShrink: 0 } as React.CSSProperties,
  searchIcon: { position: "absolute", left: "28px", top: "50%", transform: "translateY(-50%)" } as React.CSSProperties,
  patientList: { flex: 1, overflowY: "auto", padding: "8px 0" } as React.CSSProperties,
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
  .patient-row { position: relative; padding: 12px 14px; margin: 4px 10px; cursor: pointer; display: flex; align-items: center; gap: 12px; border-radius: 12px; transition: all 0.15s ease; border: 2px solid transparent; }
  .patient-row:hover { background-color: #f0f9ff; border-color: #93c5fd; }
  .patient-row-active { background-color: #eff6ff !important; border-color: #2563eb !important; }
  .action-btn { padding: 3px 8px; font-size: 11px; border: none; border-radius: 4px; cursor: pointer; font-weight: 700; transition: all 0.15s ease; }
  .edit-btn { background: #3b82f6; color: #fff; }
  .edit-btn:hover { background: #2563eb; }
  .delete-btn { background: #ef4444; color: #fff; }
  .delete-btn:hover { background: #dc2626; }
  .summary-card { transition: all 0.2s ease; }
  .summary-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,42,0.06) !important; }
  .timeline-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(15,23,42,0.08) !important; }
  .timeline-arrow:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
  .pulse-soft { animation: pulse-soft 2.5s ease-in-out infinite; }
  .report-item:hover { background-color: #f1f5f9 !important; }
  .spin { animation: spin 0.8s linear infinite; }
`;