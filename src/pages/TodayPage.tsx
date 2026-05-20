/**
 * SAKHI CLINIC — TODAY PAGE (Phase 2)
 * ─────────────────────────────────────────────────────────────────
 * 3-column queue workspace. The operational heart of the clinic.
 * LEFT  : Live patient queue for today
 * CENTER: Active patient context + quick actions
 * RIGHT : Daily stats + missed follow-ups + today's appointments
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { usePatientStore } from "../store/usePatientStore";
import { useConsultationStore } from "../store/useConsultationStore";
import { useAppointmentStore } from "../store/useAppointmentStore";
import { useQueueStore, QueueEntry } from "../store/queueStore";
import { useUIStore } from "../store/uiStore";
import { normalizePatientPhone } from "../utils/whatsapp";
import { SplitPane } from "../components/layout/LayoutPrimitives";
import {
  Users, Clock, CheckCircle2, AlertCircle, Plus, Search,
  ChevronRight, Phone, Calendar, Activity, TrendingUp,
  MessageCircle, Stethoscope, X, ArrowUp, ArrowDown,
  IndianRupee, UserCheck, Zap, RefreshCw, Bell,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────

interface TodayPageProps {
  goToConsultation: (patientId: string, appointmentId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const daysAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  return Math.floor(diff / 86400000);
};

const getInitials = (name: string) => name?.charAt(0)?.toUpperCase() || "?";

const avatarColor = (gender: string) =>
  gender === "Female"
    ? { bg: "#fdf2f8", border: "#f9a8d4", text: "#be185d" }
    : { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" };

// ─── Status chip ──────────────────────────────────────────────────

function StatusChip({ status }: { status: QueueEntry["status"] }) {
  const map = {
    waiting:     { bg: "#f1f5f9", color: "#64748b", label: "Waiting",     dot: "#94a3b8" },
    "in-progress": { bg: "#f0fdfd", color: "#0D7377", label: "In Progress", dot: "#0D7377" },
    done:        { bg: "#f0fdf4", color: "#16a34a", label: "Done",         dot: "#16a34a" },
    skipped:     { bg: "#fef2f2", color: "#dc2626", label: "Skipped",      dot: "#dc2626" },
  };
  const c = map[status] || map.waiting;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
      background: c.bg, color: c.color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot,
        ...(status === "in-progress" ? { animation: "pulse-dot 1.5s infinite" } : {}) }} />
      {c.label}
    </span>
  );
}

// ─── Alert Dots ───────────────────────────────────────────────────

function AlertDots({ alerts }: { alerts: QueueEntry["alerts"] }) {
  return (
    <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {alerts.hasPendingPayment && (
        <span title={`₹${alerts.pendingAmount} pending`}
          style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444",
            flexShrink: 0, cursor: "default" }} />
      )}
      {alerts.missedFollowUp && (
        <span title="Missed follow-up"
          style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b",
            flexShrink: 0, cursor: "default" }} />
      )}
      {alerts.isFirstVisit && (
        <span title="First visit"
          style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6",
            flexShrink: 0, cursor: "default" }} />
      )}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, sub }:
  { icon: React.ReactNode; label: string; value: string | number;
    color: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #f1f5f9",
      padding: "16px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
      <div style={{ width: 40, height: 40, borderRadius: "12px",
        background: `${color}15`, display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0 }}>
        {React.cloneElement(icon as React.ReactElement, { size: 18, color })}
      </div>
      <div>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
        <div style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", lineHeight: 1.1, marginTop: "2px" }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Add to Queue Dropdown ────────────────────────────────────────

function AddToQueueDropdown({ onAdd, onClose }:
  { onAdd: (patientId: string) => void; onClose: () => void }) {
  const patients = usePatientStore((s) => s.patients);
  const isInQueue = useQueueStore((s) => s.isInQueue);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return patients.slice(0, 8);
    return patients.filter(p =>
      p.name.toLowerCase().includes(t) || (p.phone || "").includes(t)
    ).slice(0, 8);
  }, [q, patients]);

  return (
    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0,
      background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0",
      boxShadow: "0 20px 48px rgba(15,23,42,0.14)", zIndex: 200, overflow: "hidden" }}>
      {/* Search */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", gap: "10px" }}>
        <Search size={14} color="#94a3b8" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          data-testid="queue-search-input"
          placeholder="Search patient…"
          style={{ border: "none", outline: "none", fontSize: "14px",
            fontFamily: "inherit", flex: 1, background: "transparent", color: "#0f172a" }} />
        <button onClick={onClose} style={{ background: "none", border: "none",
          cursor: "pointer", color: "#94a3b8", padding: 0 }}>
          <X size={14} />
        </button>
      </div>
      {/* Results */}
      <div style={{ maxHeight: "260px", overflowY: "auto" }}>
        {results.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8",
            fontSize: "13px", fontWeight: 600 }}>No patients found</div>
        ) : results.map(p => {
          const inQueue = isInQueue(p.id);
          const av = avatarColor(p.gender);
          return (
            <button key={p.id} onClick={() => !inQueue && onAdd(p.id)}
              disabled={inQueue}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 14px", background: "transparent", border: "none",
                cursor: inQueue ? "default" : "pointer", textAlign: "left",
                opacity: inQueue ? 0.5 : 1, transition: "background 0.1s" }}
              onMouseEnter={e => { if (!inQueue) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                background: av.bg, border: `1.5px solid ${av.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", fontWeight: 800, color: av.text }}>
                {getInitials(p.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                  {p.phone} · {p.age}Y · {p.gender}
                </div>
              </div>
              {inQueue && (
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#0D7377",
                  background: "#f0fdfd", padding: "2px 8px", borderRadius: "6px" }}>
                  In Queue
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── LEFT PANEL: Queue ────────────────────────────────────────────

function QueuePanel({ activeQueueId, onSelect, goToConsultation }:
  { activeQueueId: string | null;
    onSelect: (entry: QueueEntry) => void;
    goToConsultation: (patientId: string, appointmentId: string) => void }) {

  const queue = useQueueStore((s) => s.queue);
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const removeFromQueue = useQueueStore((s) => s.removeFromQueue);
  const setStatus = useQueueStore((s) => s.setStatus);
  const moveUp = useQueueStore((s) => s.moveUp);
  const moveDown = useQueueStore((s) => s.moveDown);
  const consultations = useConsultationStore((s) => s.consultations);
  const patients = usePatientStore((s) => s.patients);
  const activeClinic = useUIStore((s) => s.activeClinic);
  const [showAdd, setShowAdd] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setShowAdd(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleAddPatient = (patientId: string) => {
    const p = patients.find(x => x.id === patientId);
    if (!p) return;

    // Compute alerts
    const patientConsults = consultations.filter(c => c.patientId === patientId);
    const pendingConsults = patientConsults.filter(c => c.paymentStatus === "pending" && (c.fee || 0) > 0);
    const pendingAmount = pendingConsults.reduce((s, c) => s + (c.fee || 0), 0);
    const today = todayStr();
    const missedFollowUp = !!(p.nextFollowUpDate && p.nextFollowUpDate < today);

    addToQueue({
      patientId: p.id,
      appointmentId: "",
      patientName: p.name,
      clinic: activeClinic,
      alerts: {
        hasPendingPayment: pendingAmount > 0,
        pendingAmount,
        isFirstVisit: patientConsults.length === 0,
        missedFollowUp,
      },
    });
    setShowAdd(false);
  };

  const waiting = queue.filter(e => e.status === "waiting").length;
  const done = queue.filter(e => e.status === "done").length;

  return (
    <div
      data-testid="queue-panel"
      style={{ width: "280px", flexShrink: 0, background: "#fff",
      borderRight: "1px solid #f1f5f9", display: "flex", flexDirection: "column",
      height: "100%" }}>

      {/* Header */}
      <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#0f172a" }}>
              Today's Queue
            </h2>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", fontWeight: 600 }}>
              {activeClinic} · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b",
              background: "#f1f5f9", padding: "3px 8px", borderRadius: "8px" }}>
              {waiting} waiting
            </span>
            {done > 0 && (
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#16a34a",
                background: "#f0fdf4", padding: "3px 8px", borderRadius: "8px" }}>
                {done} done
              </span>
            )}
          </div>
        </div>

        {/* Add button */}
        <div ref={addRef} style={{ position: "relative" }}>
          <button
            data-testid="add-patient-to-queue-btn"
            onClick={() => setShowAdd(s => !s)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: "7px", padding: "9px", borderRadius: "10px",
              background: "#0D7377", border: "none", cursor: "pointer",
              color: "#fff", fontSize: "13px", fontWeight: 700, transition: "all 0.2s" }}>
            <Plus size={15} />
            Add Patient to Queue
          </button>
          {showAdd && (
            <AddToQueueDropdown onAdd={handleAddPatient} onClose={() => setShowAdd(false)} />
          )}
        </div>
      </div>

      {/* Queue list */}
      <div data-testid="queue-list" style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {queue.length === 0 ? (
          <div data-testid="queue-empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🏥</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8", lineHeight: 1.6 }}>
              No patients in queue.<br />Add from appointments or walk-ins.
            </div>
          </div>
        ) : (
          queue.map((entry, idx) => {
            const isActive = entry.queueId === activeQueueId;
            const av = avatarColor(
              patients.find(p => p.id === entry.patientId)?.gender || ""
            );
            return (
              <div
                key={entry.queueId}
                data-testid={isActive ? `queue-row-active-${entry.queueId}` : `queue-row-${entry.queueId}`}
                onClick={() => entry.status !== "done" && onSelect(entry)}
                style={{ padding: "10px 10px", borderRadius: "12px", marginBottom: "4px",
                  cursor: entry.status === "done" ? "default" : "pointer",
                  background: isActive ? "#f0fdfd" : "transparent",
                  border: `1.5px solid ${isActive ? "#0D7377" : "transparent"}`,
                  transition: "all 0.15s ease", position: "relative" }}>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  {/* Position number */}
                  <div style={{ width: "20px", flexShrink: 0, fontSize: "11px",
                    fontWeight: 800, color: "#94a3b8", textAlign: "center", paddingTop: "8px" }}>
                    {idx + 1}
                  </div>

                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: "50%",
                    background: av.bg, border: `1.5px solid ${av.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", fontWeight: 800, color: av.text, flexShrink: 0 }}>
                    {getInitials(entry.patientName)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <span
                        data-testid={`queue-patient-name-${entry.queueId}`}
                        style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.patientName}
                      </span>
                      <AlertDots alerts={entry.alerts} />
                    </div>
                    <span data-testid={`queue-status-${entry.queueId}`}>
                      <StatusChip status={entry.status} />
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", flexShrink: 0 }}>
                    {entry.status === "waiting" && (
                      <>
                        <button
                          data-testid={`queue-move-up-${entry.queueId}`}
                          onClick={e => { e.stopPropagation(); moveUp(entry.queueId); }}
                          style={{ background: "none", border: "1px solid #e2e8f0",
                            borderRadius: "6px", cursor: "pointer", padding: "2px",
                            color: "#94a3b8", display: "flex" }}>
                          <ArrowUp size={11} />
                        </button>
                        <button
                          data-testid={`queue-move-down-${entry.queueId}`}
                          onClick={e => { e.stopPropagation(); moveDown(entry.queueId); }}
                          style={{ background: "none", border: "1px solid #e2e8f0",
                            borderRadius: "6px", cursor: "pointer", padding: "2px",
                            color: "#94a3b8", display: "flex" }}>
                          <ArrowDown size={11} />
                        </button>
                      </>
                    )}
                    <button
                      data-testid={`queue-remove-${entry.queueId}`}
                      onClick={e => { e.stopPropagation(); removeFromQueue(entry.queueId); }}
                      style={{ background: "none", border: "1px solid #e2e8f0",
                        borderRadius: "6px", cursor: "pointer", padding: "2px",
                        color: "#94a3b8", display: "flex" }}>
                      <X size={11} />
                    </button>
                  </div>
                </div>

                {/* In-progress: Start Consultation shortcut */}
                {isActive && entry.status === "waiting" && (
                  <button
                    data-testid={`queue-start-consultation-${entry.queueId}`}
                    onClick={e => {
                      e.stopPropagation();
                      setStatus(entry.queueId, "in-progress");
                      goToConsultation(entry.patientId, entry.appointmentId);
                    }}
                    style={{ marginTop: "8px", marginLeft: "30px", width: "calc(100% - 30px)",
                      padding: "7px", borderRadius: "8px", background: "#0D7377",
                      border: "none", color: "#fff", fontSize: "12px", fontWeight: 700,
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: "6px" }}>
                    <Stethoscope size={13} /> Start Consultation
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── CENTER PANEL: Active Patient ────────────────────────────────

function ActivePatientPanel({ entry, goToConsultation }:
  { entry: QueueEntry | null;
    goToConsultation: (patientId: string, appointmentId: string) => void }) {

  const patients = usePatientStore((s) => s.patients);
  const consultations = useConsultationStore((s) => s.consultations);
  const setStatus = useQueueStore((s) => s.setStatus);

  const patient = entry ? patients.find(p => p.id === entry.patientId) : null;

  const patientConsults = useMemo(() => {
    if (!patient) return [];
    return [...consultations.filter(c => c.patientId === patient.id)]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [consultations, patient]);

  const lastConsult = patientConsults[0] || null;

  const revenue = useMemo(() => {
    const paid = patientConsults.filter(c => c.paymentStatus === "paid").reduce((s, c) => s + (c.fee || 0), 0);
    const pending = patientConsults.filter(c => c.paymentStatus === "pending" && (c.fee || 0) > 0).reduce((s, c) => s + (c.fee || 0), 0);
    return { paid, pending };
  }, [patientConsults]);

  // Empty state
  if (!entry || !patient) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "40px",
        background: "#f8fafc" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%",
          background: "#f0fdfd", border: "2px solid #99f6e4",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "20px" }}>
          <Users size={36} color="#0D7377" strokeWidth={1.5} />
        </div>
        <h3 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: 900,
          color: "#0f172a", letterSpacing: "-0.3px" }}>
          No Patient Selected
        </h3>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px", textAlign: "center",
          maxWidth: "280px", lineHeight: 1.7 }}>
          Click a patient in the queue to see their full context and begin consultation.
        </p>
      </div>
    );
  }

  const av = avatarColor(patient.gender);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", padding: "24px" }}>

      {/* Patient Header Card */}
      <div style={{ background: "#fff", borderRadius: "20px",
        border: "1px solid #e2e8f0", padding: "24px", marginBottom: "16px",
        boxShadow: "0 4px 20px rgba(15,23,42,0.04)" }}>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "18px" }}>
          {/* Avatar */}
          <div style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
            background: av.bg, border: `2px solid ${av.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", fontWeight: 900, color: av.text }}>
            {getInitials(patient.name)}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 900,
                color: "#0f172a", letterSpacing: "-0.4px" }}>
                {patient.name}
              </h2>
              {entry.alerts.isFirstVisit && (
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#1d4ed8",
                  background: "#eff6ff", padding: "3px 10px", borderRadius: "20px",
                  border: "1px solid #bfdbfe" }}>
                  🔵 First Visit
                </span>
              )}
              {entry.alerts.missedFollowUp && (
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#b45309",
                  background: "#fffbeb", padding: "3px 10px", borderRadius: "20px",
                  border: "1px solid #fde68a" }}>
                  🟡 Missed Follow-up
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
              {[
                patient.age ? `${patient.age}Y` : null,
                patient.gender,
                patient.phone,
                patient.address,
              ].filter(Boolean).map((val, i) => (
                <span key={i} style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>
                  {i > 0 && <span style={{ color: "#cbd5e1", marginRight: "12px" }}>·</span>}
                  {val}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                setStatus(entry.queueId, "in-progress");
                goToConsultation(patient.id, entry.appointmentId);
              }}
              style={{ display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 18px", borderRadius: "12px",
                background: "#0D7377", border: "none", color: "#fff",
                fontSize: "13px", fontWeight: 800, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(13,115,119,0.25)",
                transition: "all 0.2s" }}>
              <Stethoscope size={15} />
              Start Consultation
            </button>
          </div>
        </div>

        {/* Pending dues alert */}
        {entry.alerts.hasPendingPayment && (
          <div style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "10px",
            background: "#fef2f2", border: "1px solid #fecaca",
            display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={16} color="#ef4444" />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#b91c1c" }}>
              ₹{entry.alerts.pendingAmount} pending payment — collect before or after consultation
            </span>
          </div>
        )}
      </div>

      {/* Last Visit Card */}
      <div style={{ background: "#fff", borderRadius: "20px",
        border: "1px solid #e2e8f0", padding: "20px", marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "14px" }}>
          Last Visit
        </div>

        {lastConsult ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                  {lastConsult.chiefComplaint || lastConsult.caseText?.slice(0, 80) || "No complaint recorded"}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
                  {fmtDate(lastConsult.date)} · {daysAgo(lastConsult.date)} days ago
                </div>
              </div>
              {lastConsult.outcome && (
                <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 10px",
                  borderRadius: "8px", flexShrink: 0,
                  background: lastConsult.outcome === "Improved" ? "#f0fdf4" : "#f8fafc",
                  color: lastConsult.outcome === "Improved" ? "#16a34a" : "#64748b",
                  border: `1px solid ${lastConsult.outcome === "Improved" ? "#bbf7d0" : "#e2e8f0"}` }}>
                  {lastConsult.outcome}
                </span>
              )}
            </div>

            {/* Medicines */}
            {lastConsult.medicines?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {lastConsult.medicines.map((m, i) => (
                  <span key={i} style={{ padding: "4px 10px", borderRadius: "8px",
                    background: "#f8fafc", border: "1px solid #e2e8f0",
                    fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                    💊 {m.name} {m.dosage ? `· ${m.dosage}` : ""}
                  </span>
                ))}
              </div>
            )}

            {lastConsult.followUpDate && (
              <div style={{ marginTop: "12px", fontSize: "12px", color: "#64748b",
                fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                <Calendar size={12} />
                Follow-up was: {fmtDate(lastConsult.followUpDate)}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>✨</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8" }}>
              No previous visits — this is a new patient
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <div style={{ background: "#fff", borderRadius: "14px",
          border: "1px solid #f1f5f9", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.5px" }}>Visits</div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>
            {patientConsults.length}
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: "14px",
          border: "1px solid #f1f5f9", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Paid</div>
          <div style={{ fontSize: "20px", fontWeight: 900, color: "#16a34a", marginTop: "4px" }}>
            {fmtCurrency(revenue.paid)}
          </div>
        </div>
        <div style={{ background: revenue.pending > 0 ? "#fef2f2" : "#fff",
          borderRadius: "14px",
          border: `1px solid ${revenue.pending > 0 ? "#fecaca" : "#f1f5f9"}`,
          padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.5px" }}>Pending</div>
          <div style={{ fontSize: "20px", fontWeight: 900,
            color: revenue.pending > 0 ? "#ef4444" : "#0f172a", marginTop: "4px" }}>
            {fmtCurrency(revenue.pending)}
          </div>
        </div>
      </div>

      {/* Case History Preview */}
      {patientConsults.length > 1 && (
        <div style={{ background: "#fff", borderRadius: "20px",
          border: "1px solid #e2e8f0", padding: "20px", marginTop: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "14px" }}>
            Visit History ({patientConsults.length} total)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
            {patientConsults.slice(1, 6).map((c, i) => (
              <div key={c.id || i} style={{ display: "flex", alignItems: "center",
                gap: "12px", padding: "10px 12px", borderRadius: "10px",
                background: "#f8fafc", border: "1px solid #f1f5f9" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%",
                  background: c.outcome === "Improved" ? "#16a34a" :
                    c.outcome === "Worse" ? "#ef4444" : "#94a3b8",
                  flexShrink: 0 }} />
                <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600,
                  whiteSpace: "nowrap" }}>
                  {fmtDate(c.date)}
                </div>
                <div style={{ fontSize: "12px", color: "#475569", fontWeight: 700,
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.chiefComplaint || c.caseText?.slice(0, 50) || "—"}
                </div>
                {c.medicines?.[0]?.name && (
                  <span style={{ fontSize: "11px", color: "#64748b", background: "#fff",
                    border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: "6px",
                    fontWeight: 700, flexShrink: 0 }}>
                    {c.medicines[0].name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RIGHT PANEL: Stats + Follow-ups + Appointments ───────────────

function StatsPanel({ goToConsultation }:
  { goToConsultation: (patientId: string, appointmentId: string) => void }) {

  const consultations = useConsultationStore((s) => s.consultations);
  const patients = usePatientStore((s) => s.patients);
  const appointments = useAppointmentStore((s) => s.appointments);
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const isInQueue = useQueueStore((s) => s.isInQueue);
  const activeClinic = useUIStore((s) => s.activeClinic);

  const today = todayStr();

  // Today's revenue
  const todayRevenue = useMemo(() =>
    consultations
      .filter(c => c.date?.slice(0, 10) === today && c.paymentStatus === "paid")
      .reduce((s, c) => s + (c.fee || 0), 0),
    [consultations, today]
  );

  // Queue stats
  const queue = useQueueStore((s) => s.queue);
  const { waiting, done } = useMemo(() => {
    let waitingCount = 0;
    let doneCount = 0;
    for (const entry of queue) {
      if (entry.status === "waiting") waitingCount += 1;
      else if (entry.status === "done") doneCount += 1;
    }
    return { waiting: waitingCount, done: doneCount };
  }, [queue]);

  // Missed follow-ups
  const missedFollowUps = useMemo(() =>
    patients
      .filter(p => p.nextFollowUpDate && p.nextFollowUpDate < today)
      .sort((a, b) =>
        new Date(a.nextFollowUpDate!).getTime() - new Date(b.nextFollowUpDate!).getTime()
      )
      .slice(0, 5),
    [patients, today]
  );

  // Today's appointments for active clinic
  const todayAppts = useMemo(() =>
    appointments
      .filter(a => a.date === today && a.clinic === activeClinic)
      .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, today, activeClinic]
  );

  const handleAddApptToQueue = (appt: typeof appointments[0]) => {
    const p = patients.find(x => x.id === appt.patientId);
    if (!p) return;

    const patientConsults = consultations.filter(c => c.patientId === p.id);
    const pendingAmount = patientConsults
      .filter(c => c.paymentStatus === "pending" && (c.fee || 0) > 0)
      .reduce((s, c) => s + (c.fee || 0), 0);

    addToQueue({
      patientId: p.id,
      appointmentId: appt.id,
      patientName: p.name,
      clinic: activeClinic,
      alerts: {
        hasPendingPayment: pendingAmount > 0,
        pendingAmount,
        isFirstVisit: patientConsults.length === 0,
        missedFollowUp: !!(p.nextFollowUpDate && p.nextFollowUpDate < today),
      },
    });
  };

  const apptStatusColor = (status: string) => {
    const m: Record<string, string> = {
      booked: "#94a3b8", arrived: "#3b82f6",
      "in-progress": "#0D7377", done: "#16a34a"
    };
    return m[status] || "#94a3b8";
  };

  return (
    <div style={{ width: "260px", flexShrink: 0, background: "#f8fafc",
      borderLeft: "1px solid #f1f5f9", overflowY: "auto",
      display: "flex", flexDirection: "column", gap: "0" }}>

      {/* Stats */}
      <div style={{ padding: "16px 14px 10px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "10px" }}>
          Today's Snapshot
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <StatCard icon={<Users />} label="In Queue" value={queue.length} color="#0D7377" />
          <StatCard icon={<Clock />} label="Waiting" value={waiting} color="#f59e0b" />
          <StatCard icon={<CheckCircle2 />} label="Done" value={done} color="#16a34a" />
          <StatCard icon={<IndianRupee />} label="Revenue" value={fmtCurrency(todayRevenue)}
            color="#8b5cf6" sub="today · paid only" />
        </div>
      </div>

      {/* Missed Follow-ups */}
      {missedFollowUps.length > 0 && (
        <div style={{ padding: "14px 14px 10px", borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
            <Bell size={13} color="#f59e0b" />
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: "0.7px" }}>
              Missed Follow-ups
            </div>
            <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 800,
              color: "#b45309", background: "#fef3c7", padding: "2px 7px",
              borderRadius: "6px", border: "1px solid #fde68a" }}>
              {missedFollowUps.length}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {missedFollowUps.map(p => (
              <div key={p.id} style={{ padding: "10px 12px", borderRadius: "10px",
                background: "#fff", border: "1px solid #fde68a" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a",
                  marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap" }}>
                  {p.name}
                </div>
                <div style={{ fontSize: "11px", color: "#b45309", fontWeight: 600,
                  marginBottom: "6px" }}>
                  {daysAgo(p.nextFollowUpDate!)} days overdue
                </div>
                {normalizePatientPhone(p) && (
                  <button
                    onClick={() => {
                      const rawNumber = p.phone || (p as any).mobile || "";
                      const msg = `Dear ${p.name}, your follow-up at Sakhi Clinic is overdue. Please visit or call us.`;
                      const link = generateWhatsAppLink(rawNumber, msg);
                      if (!link) return alert("⚠️ Patient mobile number is missing or invalid.");
                      window.location.href = link;
                    }}
                    style={{ display: "flex", alignItems: "center", gap: "5px",
                      padding: "4px 10px", borderRadius: "7px",
                      background: "#16a34a", border: "none", color: "#fff",
                      fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                    <MessageCircle size={11} /> Remind
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Appointments */}
      <div style={{ padding: "14px 14px 20px", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
          <Calendar size={13} color="#0D7377" />
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.7px" }}>
            {activeClinic} · Today
          </div>
          <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 800,
            color: "#0D7377", background: "#f0fdfd", padding: "2px 7px",
            borderRadius: "6px" }}>
            {todayAppts.length}
          </span>
        </div>

        {todayAppts.length === 0 ? (
          <div style={{ padding: "16px 0", textAlign: "center",
            fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
            No appointments for today
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {todayAppts.map(appt => {
              const inQueue = isInQueue(appt.patientId);
              const statusColor = apptStatusColor(appt.status);
              return (
                <div key={appt.id} style={{ padding: "10px 12px", borderRadius: "10px",
                  background: "#fff", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: "120px" }}>
                        {appt.patientName}
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>
                        ⏰ {appt.time}
                      </div>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: statusColor,
                      background: `${statusColor}18`, padding: "2px 7px",
                      borderRadius: "6px", flexShrink: 0, textTransform: "capitalize" }}>
                      {appt.status}
                    </span>
                  </div>

                  {!inQueue && appt.status !== "done" && (
                    <button onClick={() => handleAddApptToQueue(appt)}
                      style={{ display: "flex", alignItems: "center", gap: "5px",
                        padding: "5px 10px", borderRadius: "7px", width: "100%",
                        justifyContent: "center", background: "#f0fdfd",
                        border: "1px solid #99f6e4", color: "#0D7377",
                        fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                      <Plus size={11} /> Add to Queue
                    </button>
                  )}
                  {inQueue && (
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#0D7377",
                      textAlign: "center", padding: "4px" }}>
                      ✓ In Queue
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────

export default function TodayPage({ goToConsultation }: TodayPageProps) {
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const queue = useQueueStore((s) => s.queue);

  const loadPatients = usePatientStore((s) => s.loadPatients);
  const loadConsultations = useConsultationStore((s) => s.loadConsultations);
  const loadAppointments = useAppointmentStore((s) => s.loadAppointments);

  // Load all data on mount
  useEffect(() => {
    loadPatients();
    loadConsultations();
    loadAppointments();
  }, [loadPatients, loadConsultations, loadAppointments]);

  // Auto-select first waiting patient if nothing selected
  useEffect(() => {
    if (!activeQueueId && queue.length > 0) {
      const first = queue.find(e => e.status === "waiting");
      if (first) setActiveQueueId(first.queueId);
    }
  }, [queue, activeQueueId]);

  const activeEntry = useMemo(
    () => queue.find(e => e.queueId === activeQueueId) || null,
    [queue, activeQueueId]
  );

  return (
    <SplitPane style={{ display: "flex", height: "100%", overflow: "hidden",
      background: "#f8fafc", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", width: "100%" }}>

      {/* LEFT: Queue */}
      <QueuePanel
        activeQueueId={activeQueueId}
        onSelect={(entry) => setActiveQueueId(entry.queueId)}
        goToConsultation={goToConsultation}
      />

      {/* CENTER: Active Patient */}
      <ActivePatientPanel
        entry={activeEntry}
        goToConsultation={goToConsultation}
      />

      {/* RIGHT: Stats */}
      <StatsPanel goToConsultation={goToConsultation} />

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </SplitPane>
  );
}
