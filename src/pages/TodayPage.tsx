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
import { patientRepository } from "../repositories/patientRepository";
import { appointmentRepository } from "../repositories/appointmentRepository";
import { PullToRefreshScrollRegion, SplitPane } from "../components/layout/LayoutPrimitives";
import { MobileCard, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { ActivePage } from "../store/uiStore";
import { hasActiveReminder, enqueueReminder } from "../services/reminderQueueService";
import { buildFollowUpMessage } from "../services/reminderSchedulerService";
import { FollowUpBucketEntry } from "../services/followUpIntelligenceService";
import { haptic } from "../utils/haptics";
import {
  Users, Clock, CheckCircle2, AlertCircle, Plus, Search,
  ChevronRight, Phone, Calendar, Activity, TrendingUp,
  MessageCircle, Stethoscope, X, ArrowUp, ArrowDown,
  IndianRupee, UserCheck, Zap, RefreshCw, Bell,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────

interface TodayPageProps {
  goToConsultation: (patientId: string, appointmentId: string) => void;
  onNavigate?: (page: ActivePage) => void;
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
  const [results, setResults] = useState<typeof patients>([]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let mounted = true;
    const t = q.toLowerCase().trim();

    const doSearch = async () => {
      if (!t) {
        // Return recent patients from transient store for speed
        if (mounted) setResults(patients.slice(0, 8));
        return;
      }

      try {
        // Query canonical DB for up-to-date results
        const all = await patientRepository.list();
        let filtered = all.filter((p) =>
          (p.name || '').toLowerCase().includes(t) || (p.phone || '').includes(t)
        ).slice(0, 8);

        // Fallback: if no patients found, try appointments (recent bookings)
        if (filtered.length === 0) {
          try {
            const appts = (await appointmentRepository.list()).filter(
              (a) => (a.patientName || "").toLowerCase().includes(t)
            );
            const seen = new Set<string>();
            const fromAppts = appts.filter(a => {
              if (!a.patientId) return false;
              if (seen.has(a.patientId)) return false;
              seen.add(a.patientId);
              return true;
            }).slice(0, 8).map(a => ({ id: a.patientId, name: a.patientName || '', phone: '' } as any));
            if (fromAppts.length > 0) filtered = fromAppts;
          } catch (err) {
            console.warn('[AddToQueueDropdown] appointment fallback failed', err);
          }
        }
        if (mounted) setResults(filtered);
      } catch (err) {
        console.error('[AddToQueueDropdown] search failed', err);
        if (mounted) setResults([]);
      }
    };

    doSearch();
    return () => { mounted = false; };
  }, [q, patients]);

  

  return (
    <div
      className="sakhi-menu-panel"
      style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 200 }}
    >
      {/* Search */}
      <div style={{ padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid rgba(226, 232, 240, 0.8)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <Search size={14} color="#94a3b8" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          data-testid="queue-search-input"
          placeholder="Search patient…"
          className="sakhi-input"
          style={{ border: "none", boxShadow: "none", padding: 0, outline: "none", flex: 1, background: "transparent", fontWeight: 800 }}
        />
        <button
          type="button"
          onClick={onClose}
          className="sakhi-icon-action sakhi-tap sakhi-focus-ring sakhi-ripple"
          style={{ width: 36, height: 36 }}
          aria-label="Close search"
        >
          <X size={14} />
        </button>
      </div>
      {/* Results */}
      <div style={{ maxHeight: "260px", overflowY: "auto" }}>
        {results.length === 0 ? (
          <div className="sakhi-caption" style={{ padding: "var(--space-4)", textAlign: "center", color: "#94a3b8" }}>
            No patients found
          </div>
        ) : results.map(p => {
          const inQueue = isInQueue(p.id);
          const av = avatarColor(p.gender);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { if (!inQueue) { haptic("tap"); onAdd(p.id); } }}
              disabled={inQueue}
              className="sakhi-menu-row sakhi-tap sakhi-focus-ring sakhi-ripple"
              data-active="false"
              style={inQueue ? { opacity: 0.55, cursor: "default" } : undefined}
            >
              <div className="sakhi-queue-avatar" style={{ background: av.bg, border: `1.5px solid ${av.border}`, color: av.text }}>
                {getInitials(p.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sakhi-queue-chip-name">
                  {p.name}
                </div>
                <div className="sakhi-caption" style={{ color: "#94a3b8" }}>
                  {p.phone} · {p.age}Y · {p.gender}
                </div>
              </div>
              {inQueue && (
                <span className="sakhi-pill" data-tone="brand" style={{ fontSize: "var(--type-micro)" }}>
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

function QueuePanel({ activeQueueId, onSelect, goToConsultation, isMobile = false }:
  { activeQueueId: string | null;
    onSelect: (entry: QueueEntry) => void;
    goToConsultation: (patientId: string, appointmentId: string) => void;
    isMobile?: boolean }) {

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
    let p = patients.find(x => x.id === patientId);
    const ensurePatient = async () => {
      if (p) return p;
      try {
        const fromDb = await patientRepository.getById(patientId);
        if (fromDb && !fromDb.deletedAt) {
          // update transient store for UI
          usePatientStore.setState((s) => ({ patients: [...s.patients, fromDb] }));
          p = fromDb as any;
          return p;
        }
        // Fallback: find appointment with same patientId and use its name
        const appts = await appointmentRepository.listByPatient(patientId);
        const appt =
          appts
            .slice()
            .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0] || null;
        if (appt) {
          const pseudo = { id: appt.patientId, name: appt.patientName || '', phone: '' } as any;
          usePatientStore.setState((s) => ({ patients: [...s.patients, pseudo] }));
          p = pseudo;
          return p;
        }
      } catch (err) {
        console.warn('[QueuePanel] ensurePatient failed', err);
      }
      return null;
    };

    // ensurePatient may fetch from DB; run in IIFE
    (async () => {
      const patientObj = await ensurePatient();
      if (!patientObj) return;

      // Compute alerts
      const patientConsults = consultations.filter(c => c.patientId === patientId);
      const pendingConsults = patientConsults.filter(c => c.paymentStatus === "pending" && (c.fee || 0) > 0);
      const pendingAmount = pendingConsults.reduce((s, c) => s + (c.fee || 0), 0);
      const today = todayStr();
      const missedFollowUp = !!(patientObj.nextFollowUpDate && patientObj.nextFollowUpDate < today);

      addToQueue({
        patientId: patientObj.id,
        appointmentId: "",
        patientName: patientObj.name,
        clinic: activeClinic,
        alerts: {
          hasPendingPayment: pendingAmount > 0,
          pendingAmount,
          isFirstVisit: patientConsults.length === 0,
          missedFollowUp,
        },
      });
      setShowAdd(false);
    })();

    return;
  };

  const waiting = queue.filter(e => e.status === "waiting").length;
  const done = queue.filter(e => e.status === "done").length;

  return (
    <div
      data-testid="queue-panel"
      className={isMobile ? "" : "sakhi-module"}
      style={{
        width: isMobile ? "100%" : "280px",
        maxWidth: "100%",
        flexShrink: 0,
        minWidth: 0,
        background: isMobile ? "transparent" : undefined,
        borderRight: isMobile ? "none" : undefined,
        borderBottom: isMobile ? "1px solid rgba(226, 232, 240, 0.8)" : "none",
        display: "flex",
        flexDirection: "column",
        height: isMobile ? "auto" : "100%",
        overflow: "hidden",
        boxSizing: "border-box",
      }}>

      {/* Header */}
      <div className={isMobile ? "" : "sakhi-module-header"} style={isMobile ? { padding: "20px 16px 14px", borderBottom: "1px solid rgba(226, 232, 240, 0.8)" } : undefined}>
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
            <span className="sakhi-pill" style={{ fontSize: 11, padding: "3px 8px", background: "rgba(2,6,23,0.02)" }}>
              {waiting} waiting
            </span>
            {done > 0 && (
              <span className="sakhi-pill" style={{ fontSize: 11, padding: "3px 8px", background: "rgba(22,163,74,0.08)", borderColor: "rgba(22,163,74,0.18)", color: "#166534" }}>
                {done} done
              </span>
            )}
          </div>
        </div>

        {/* Add button */}
        <div ref={addRef} style={{ position: "relative" }}>
          <button
            data-testid="add-patient-to-queue-btn"
            onClick={async () => {
              // Ensure patient list is hydrated from canonical DB before opening
              try {
                await usePatientStore.getState().loadPatients();
              } catch (err) {
                console.error('[QueuePanel] loadPatients failed', err);
              }
              setShowAdd(s => !s);
            }}
            className="sakhi-tap sakhi-focus-ring sakhi-ripple"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 7, minHeight: 48, borderRadius: "var(--radius-3)",
              background: "var(--brand)", border: "1px solid rgba(13,115,119,0)",
              cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 900, letterSpacing: "-0.2px" }}>
            <Plus size={15} />
            Add Patient to Queue
          </button>
          {showAdd && (
            <AddToQueueDropdown onAdd={handleAddPatient} onClose={() => setShowAdd(false)} />
          )}
        </div>
      </div>

      {/* Queue list */}
      <div data-testid="queue-list" className={isMobile ? "" : "sakhi-module-body"} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "8px 8px" : undefined }}>
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
                className="sakhi-row-card sakhi-tap"
                data-active={String(isActive)}
                style={{ cursor: entry.status === "done" ? "default" : "pointer", transition: "all 0.15s ease", position: "relative" }}>

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
                          className="sakhi-mini-iconbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                          style={{ cursor: "pointer" }}>
                          <ArrowUp size={11} />
                        </button>
                        <button
                          data-testid={`queue-move-down-${entry.queueId}`}
                          onClick={e => { e.stopPropagation(); moveDown(entry.queueId); }}
                          className="sakhi-mini-iconbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                          style={{ cursor: "pointer" }}>
                          <ArrowDown size={11} />
                        </button>
                      </>
                    )}
                    <button
                      data-testid={`queue-remove-${entry.queueId}`}
                      onClick={e => { e.stopPropagation(); removeFromQueue(entry.queueId); }}
                      className="sakhi-mini-iconbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                      style={{ cursor: "pointer" }}>
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
                    className="sakhi-tap sakhi-focus-ring sakhi-ripple"
                    style={{ marginTop: "var(--space-2)", marginLeft: "30px", width: "calc(100% - 30px)",
                      minHeight: 44, borderRadius: "var(--radius-2)", background: "var(--brand)",
                      border: "1px solid rgba(13, 115, 119, 0)",
                      color: "#fff", fontSize: 12, fontWeight: 900,
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 6, boxShadow: "0 1px 0 rgba(255,255,255,0.14) inset" }}>
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

function ActivePatientPanel({ entry, goToConsultation, isMobile = false }:
  { entry: QueueEntry | null;
    goToConsultation: (patientId: string, appointmentId: string) => void;
    isMobile?: boolean }) {

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
      <div
        style={{
          flex: isMobile ? "none" : 1,
          width: isMobile ? "100%" : "auto",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "28px 16px" : "40px",
          background: "#f8fafc",
          boxSizing: "border-box",
        }}
      >
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
    <div
      style={{
        flex: isMobile ? "none" : 1,
        width: isMobile ? "100%" : "auto",
        minWidth: 0,
        overflowY: "hidden",
        background: isMobile ? "#f8fafc" : undefined,
        padding: 0,
        boxSizing: "border-box",
      }}
      className={isMobile ? "" : "sakhi-module"}
    >
      <div className={isMobile ? "" : "sakhi-module-body"} style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", padding: isMobile ? "16px" : undefined }}>

      {/* Patient Header Card */}
      <div className="sakhi-surface" style={{ padding: "var(--space-4)", marginBottom: "var(--space-3)", boxShadow: "var(--shadow-1)" }}>

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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "var(--space-2)", minWidth: 0 }}>
        <div className="sakhi-surface-flat" style={{ padding: "var(--space-3)" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.5px" }}>Visits</div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>
            {patientConsults.length}
          </div>
        </div>
        <div className="sakhi-surface-flat" style={{ padding: "var(--space-3)" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Paid</div>
          <div style={{ fontSize: "20px", fontWeight: 900, color: "#16a34a", marginTop: "4px" }}>
            {fmtCurrency(revenue.paid)}
          </div>
        </div>
        <div className="sakhi-surface-flat" style={{ padding: "var(--space-3)", background: revenue.pending > 0 ? "rgba(239, 68, 68, 0.06)" : "var(--surface)" , borderColor: revenue.pending > 0 ? "rgba(239,68,68,0.18)" : "var(--border)" }}>
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
        <div className="sakhi-surface-flat" style={{ padding: "var(--space-4)", marginTop: "var(--space-3)" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "14px" }}>
            Visit History ({patientConsults.length} total)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
            {patientConsults.slice(1, 6).map((c, i) => (
              <div key={c.id || i} className="sakhi-surface-muted" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "var(--radius-2)" }}>
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
                  <span className="sakhi-pill" style={{ fontSize: 11, padding: "2px 8px", background: "rgba(255,255,255,0.7)" }}>
                    {c.medicines[0].name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── RIGHT PANEL: Stats + Follow-ups + Appointments ───────────────

function StatsPanel({ goToConsultation, onNavigate, isMobile = false }:
  { goToConsultation: (patientId: string, appointmentId: string) => void;
    onNavigate?: (page: ActivePage) => void;
    isMobile?: boolean }) {

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

  // Routed into the canonical reminder queue instead of opening WhatsApp
  // directly -- same pattern FollowUpPage.tsx's own manual "Send Reminder"
  // button already uses (hasActiveReminder guard + buildFollowUpMessage),
  // so this becomes reviewable/trackable in RemindersPage instead of a
  // fire-and-forget send with no record anywhere. See
  // REMINDER_SYSTEM_AUDIT.md Phase 1 / REMINDER_SYSTEM_IMPLEMENTATION_REPORT.md.
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const handleRemindMissedFollowUp = async (p: { id: string; name: string; phone?: string; nextFollowUpDate?: string }) => {
    const phone = normalizePatientPhone(p);
    if (!phone) {
      alert("⚠️ Patient mobile number is missing or invalid.");
      return;
    }
    setRemindingId(p.id);
    try {
      const alreadyActive = await hasActiveReminder(p.id, "follow_up");
      if (alreadyActive) {
        alert(`${p.name} already has an active follow-up reminder awaiting review in the Reminders page.`);
        onNavigate?.("reminders");
        return;
      }
      const entry = { patientId: p.id, patientName: p.name, phone, nextFollowUpDate: p.nextFollowUpDate, isChronic: false, lastVisit: "" } as FollowUpBucketEntry;
      await enqueueReminder({
        patientId: p.id,
        patientName: p.name,
        phone,
        type: "follow_up",
        message: buildFollowUpMessage(entry, true),
        dueAt: new Date().toISOString(),
        sourceRef: "today:missed-followup",
      });
      onNavigate?.("reminders");
    } finally {
      setRemindingId(null);
    }
  };

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
    <div
      className={isMobile ? "" : "sakhi-module"}
      style={{
        width: isMobile ? "100%" : "260px",
        maxWidth: "100%",
        flexShrink: 0,
        minWidth: 0,
        background: isMobile ? "transparent" : undefined,
        borderLeft: isMobile ? "none" : undefined,
        overflowY: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: "0",
        boxSizing: "border-box",
      }}
    >
      <div className={isMobile ? "" : "sakhi-module-body"} style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", padding: isMobile ? undefined : undefined }}>

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
        <div style={{ padding: "14px 14px 10px", borderTop: "1px solid rgba(226, 232, 240, 0.8)" }}>
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
                    disabled={remindingId === p.id}
                    onClick={() => void handleRemindMissedFollowUp(p)}
                    style={{ display: "flex", alignItems: "center", gap: "5px",
                      padding: "4px 10px", borderRadius: "7px",
                      background: "#16a34a", border: "none", color: "#fff",
                      fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                    <MessageCircle size={11} /> {remindingId === p.id ? "Queuing…" : "Remind"}
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
                <div key={appt.id} className="sakhi-surface-flat" style={{ padding: "10px 12px", borderRadius: "var(--radius-2)" }}>
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
                      className="sakhi-tap sakhi-focus-ring sakhi-ripple"
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
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────

export default function TodayPage({ goToConsultation, onNavigate }: TodayPageProps) {
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const queue = useQueueStore((s) => s.queue);
  const [isMobile, setIsMobile] = useState(false);
  const setStatus = useQueueStore((s) => s.setStatus);

  const loadPatients = usePatientStore((s) => s.loadPatients);
  const loadConsultations = useConsultationStore((s) => s.loadConsultations);
  const loadAppointments = useAppointmentStore((s) => s.loadAppointments);

  // Load all data on mount
  useEffect(() => {
    loadPatients();
    loadConsultations();
    loadAppointments();
  }, [loadPatients, loadConsultations, loadAppointments]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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

  const commonShellStyle: React.CSSProperties = {
    background: "var(--surface-muted)",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };

  const desktopLayout = (
    <div className="sakhi-workstation">
      <div className="sakhi-rail" style={{ height: "100%", minHeight: 0 }}>
        <SplitPane
          style={{
            ...commonShellStyle,
            display: "flex",
            height: "100%",
            minHeight: 0,
            gap: "var(--space-3)",
            padding: "var(--space-3)",
          }}
        >
          <QueuePanel
            activeQueueId={activeQueueId}
            onSelect={(entry) => setActiveQueueId(entry.queueId)}
            goToConsultation={goToConsultation}
          />
          <ActivePatientPanel entry={activeEntry} goToConsultation={goToConsultation} />
          <StatsPanel goToConsultation={goToConsultation} onNavigate={onNavigate} />
        </SplitPane>
      </div>
    </div>
  );

  const MobileTodayCommandCenter = () => {
    const patients = usePatientStore((s) => s.patients);
    const consultations = useConsultationStore((s) => s.consultations);
    const activeClinic = useUIStore((s) => s.activeClinic);
    const [showAdd, setShowAdd] = useState(false);
    const addRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const h = (e: MouseEvent) => {
        if (addRef.current && !addRef.current.contains(e.target as Node)) setShowAdd(false);
      };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, []);

    const nextEntry = useMemo(() => {
      if (activeEntry && activeEntry.status !== "done") return activeEntry;
      return queue.find((e) => e.status === "waiting") || null;
    }, [queue, activeEntry]);

    const heroPatient = nextEntry ? patients.find((p) => p.id === nextEntry.patientId) : null;

    const heroPatientConsults = useMemo(() => {
      if (!heroPatient) return [];
      return [...consultations.filter((c) => c.patientId === heroPatient.id)]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [consultations, heroPatient]);

    const lastConsult = heroPatientConsults[0] || null;

    const waitingCount = useMemo(() => queue.filter((e) => e.status === "waiting").length, [queue]);
    const doneCount = useMemo(() => queue.filter((e) => e.status === "done").length, [queue]);

    const startHeroConsultation = () => {
      if (!nextEntry) return;
      haptic("tap");
      setStatus(nextEntry.queueId, "in-progress");
      goToConsultation(nextEntry.patientId, nextEntry.appointmentId);
    };

    return (
      <ResponsiveContainer
        className="sakhi-page"
        style={{
          ...commonShellStyle,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {/* Hero: Now Serving */}
        <MobileCard>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="sakhi-label">Now Serving</div>
              <div className="sakhi-title" style={{ marginTop: 8, fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {heroPatient?.name || (nextEntry ? nextEntry.patientName : "Queue empty")}
              </div>
              {heroPatient && (
                <div className="sakhi-body" style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, color: "#64748b", fontSize: 13 }}>
                  <span>{heroPatient.age ? `${heroPatient.age}Y` : "—"} · {heroPatient.gender || "—"}</span>
                  <span style={{ color: "#94a3b8" }}>·</span>
                  <span>{activeClinic}</span>
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="sakhi-label" style={{ color: "#94a3b8" }}>Waiting</div>
              <div style={{ fontSize: 22, fontWeight: 950, color: "var(--brand)" }}>{waitingCount}</div>
            </div>
          </div>

          {lastConsult && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border-muted)", paddingTop: 12 }}>
              <div className="sakhi-label" style={{ color: "#94a3b8" }}>Last Visit</div>
              <div className="sakhi-body" style={{ marginTop: 8, fontSize: 13, color: "#0f172a", lineHeight: 1.4 }}>
                {lastConsult.chiefComplaint || lastConsult.caseText?.slice(0, 90) || "No complaint recorded"}
              </div>
              <div className="sakhi-caption" style={{ marginTop: 8, color: "#94a3b8" }}>
                {fmtDate(lastConsult.date)} · {daysAgo(lastConsult.date)} days ago
              </div>
            </div>
          )}

          <button
            data-testid={nextEntry ? `mobile-now-serving-start-${nextEntry.queueId}` : "mobile-now-serving-start-disabled"}
            onClick={startHeroConsultation}
            disabled={!nextEntry}
            style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15 }}
            className="sakhi-btn-primary sakhi-tap sakhi-focus-ring sakhi-ripple"
          >
            <Stethoscope size={18} /> Start Consultation
          </button>
        </MobileCard>

        {/* Queue strip */}
        <MobileCard>
          <div className="flex items-center justify-between gap-4" style={{ marginBottom: 16 }}>
            <div className="sakhi-body" style={{ color: "#0f172a" }}>Queue</div>
            <div className="flex flex-wrap justify-end gap-2">
              <span className="sakhi-pill" data-tone="brand" style={{ fontSize: "var(--type-micro)" }}>
                {waitingCount} waiting
              </span>
              <span className="sakhi-pill" data-tone="success" style={{ fontSize: "var(--type-micro)" }}>
                {doneCount} seen
              </span>
            </div>
          </div>

          <div className="sakhi-chipstrip">
            {queue.length === 0 ? (
              <div className="sakhi-caption" style={{ padding: "10px 4px", color: "#94a3b8" }}>
                No patients in queue.
              </div>
            ) : (
              queue.map((entry) => {
                const isActive = entry.queueId === activeQueueId;
                const chipPatient = patients.find((p) => p.id === entry.patientId) || null;
                const av = avatarColor(chipPatient?.gender || "");
                return (
                  <button
                    key={entry.queueId}
                    type="button"
                    onClick={() => entry.status !== "done" && setActiveQueueId(entry.queueId)}
                    data-active={String(isActive)}
                    data-status={entry.status}
                    className="sakhi-queue-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                  >
                    <div
                      className="sakhi-queue-avatar"
                      style={{
                        background: av.bg,
                        border: `1.5px solid ${av.border}`,
                        color: av.text,
                      }}
                    >
                      {getInitials(entry.patientName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="sakhi-queue-chip-name">
                        {entry.patientName}
                      </div>
                      <div className="sakhi-queue-chip-sub">
                        <StatusChip status={entry.status} />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </MobileCard>

        {/* Floating Action Button: add walk-in */}
        <div
          ref={addRef}
          style={{
            position: "fixed",
            right: 16,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
            zIndex: 1100,
          }}
        >
          <button
            type="button"
            data-testid="mobile-fab-add-walkin"
            onClick={async () => {
              haptic("tap");
              try {
                await usePatientStore.getState().loadPatients();
              } catch (err) {
                console.error("[TodayPage] loadPatients failed", err);
              }
              setShowAdd((s) => !s);
            }}
            aria-label="Add walk-in patient"
            className="sakhi-fab sakhi-tap sakhi-focus-ring sakhi-ripple"
          >
            <Plus size={22} />
          </button>
          {showAdd && (
            <div style={{ position: "absolute", right: 0, bottom: 64, width: 320, maxWidth: "calc(100vw - 32px)" }}>
              <AddToQueueDropdown onAdd={(patientId) => {
                // delegate to QueuePanel handler logic by reusing existing function semantics
                // We call addToQueue through the store by letting QueuePanel handle the heavy lifting,
                // but here we keep the old dropdown UI and reuse existing add-to-queue behavior via QueuePanel's handler.
                // The QueuePanel's handler depends on local vars, so we emulate by selecting and opening the desktop list.
                // Instead, keep behavior simple: selecting a patient in dropdown will add via QueuePanel logic in store.
                // The AddToQueueDropdown already calls onAdd(patientId) only.
                const qp = (useQueueStore.getState() as any);
                const consultationsStore = useConsultationStore.getState();
                const patientsStore = usePatientStore.getState();
                let p = patientsStore.patients.find((x: any) => x.id === patientId) || null;
                (async () => {
                  if (!p) {
                    try {
                      const fromDb = await patientRepository.getById(patientId);
                      if (fromDb && !(fromDb as any).deletedAt) p = fromDb as any;
                    } catch {}
                  }
                  if (!p) return;
                  const patientConsults = consultationsStore.consultations.filter((c: any) => c.patientId === patientId);
                  const pendingAmount = patientConsults
                    .filter((c: any) => c.paymentStatus === "pending" && (c.fee || 0) > 0)
                    .reduce((s: number, c: any) => s + (c.fee || 0), 0);
                  const today = todayStr();
                  const missedFollowUp = !!((p as any).nextFollowUpDate && (p as any).nextFollowUpDate < today);
                  qp.addToQueue({
                    patientId: (p as any).id,
                    appointmentId: "",
                    patientName: (p as any).name,
                    clinic: activeClinic,
                    alerts: {
                      hasPendingPayment: pendingAmount > 0,
                      pendingAmount,
                      isFirstVisit: patientConsults.length === 0,
                      missedFollowUp,
                    },
                  });
                  setShowAdd(false);
                })();
              }} onClose={() => setShowAdd(false)} />
            </div>
          )}
        </div>
      </ResponsiveContainer>
    );
  };

  const mobileLayout = (
    <PullToRefreshScrollRegion
      data-testid="today-pull-to-refresh"
      onRefresh={async () => {
        await Promise.all([loadPatients(), loadConsultations(), loadAppointments()]);
      }}
    >
      <MobileTodayCommandCenter />
    </PullToRefreshScrollRegion>
  );

  return (
    <>
      {isMobile ? mobileLayout : desktopLayout}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </>
  );
}
