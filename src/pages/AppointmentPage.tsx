import React, { useEffect, useMemo, useState } from "react";
import {
  normalizePatientPhone,
} from "../utils/whatsapp";
import { openWhatsApp } from "../services/whatsappService";
import { generateId } from "../utils/generateId";
import useKeyboardInset from "../hooks/useKeyboardInset";
import { useAppointmentStore } from "../store/useAppointmentStore";
import { usePatientStore } from "../store/usePatientStore";
import {
  MobileCard,
  MobileField,
  MobileSection,
  ResponsiveContainer,
  ResponsiveGrid,
} from "../components/layout/ResponsivePrimitives";
import { queueAppointmentReminders, AppointmentReminderCandidate } from "../services/reminderSchedulerService";
import { ActivePage } from "../store/uiStore";
import { dateKey } from "../utils/dateOnly";

import {
  AlertCircle,
  BellRing,
  Building2,
  Calendar,
  Layers,
  Search,
  Send,
  Smartphone,
  Stethoscope,
} from "lucide-react";

type Props = {
  goToConsultation: (patientId: string, appointmentId: string) => void;
  onNavigate?: (page: ActivePage) => void;
};

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const isPastDate = (dateStr: string): boolean => {
  const selectedDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  selectedDate.setHours(0, 0, 0, 0);
  return selectedDate < today;
};

const isPastDateTime = (dateStr: string, timeStr: string): boolean => {
  if (!dateStr || !timeStr) return false;
  const [hours, minutes] = timeStr.split(":").map(Number);
  const selectedDateTime = new Date(dateStr);
  selectedDateTime.setHours(hours, minutes, 0, 0);
  const now = new Date();
  return selectedDateTime < now;
};

const isValidClinicTime = (
  clinic: "Dabholi" | "City Light",
  time: string,
): boolean => {
  const mins = timeToMinutes(time);
  if (clinic === "Dabholi") return mins >= 11 * 60 && mins < 14 * 60;
  return mins >= 14 * 60 + 30 && mins < 18 * 60 + 30;
};

const isSlotBooked = (
  date: string,
  time: string,
  clinic: "Dabholi" | "City Light",
  appointments: any[],
): boolean =>
  appointments.some(
    (a) =>
      a.date === date &&
      a.time === time &&
      a.clinic === clinic &&
      a.type === "scheduled",
  );

function formatLocalDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatTimeLabel(time: string): string {
  // "13:10" -> "1:10 PM"
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function getClinicHoursLabel(clinic: "Dabholi" | "City Light"): string {
  return clinic === "Dabholi" ? "11:00–14:00" : "14:30–18:30";
}

function generateSlotsFor(clinicType: "Dabholi" | "City Light"): string[] {
  const slots: string[] = [];
  let start: number;
  let end: number;

  if (clinicType === "Dabholi") {
    start = 11 * 60;
    end = 14 * 60;
  } else {
    start = 14 * 60 + 30;
    end = 18 * 60 + 30;
  }

  for (let t = start; t < end; t += 10) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${h}:${m.toString().padStart(2, "0")}`);
  }
  return slots;
}

export default function AppointmentPage({ goToConsultation, onNavigate }: Props) {
  const patients = usePatientStore((s) => s.patients);
  const addAppointment = useAppointmentStore((s) => s.addAppointment);
  const appointments = useAppointmentStore((s) => s.appointments);
  const startConsultation = useAppointmentStore((s) => s.startConsultation);
  const markArrived = useAppointmentStore((s) => s.markArrived);
  const loadAppointments = useAppointmentStore((s) => s.loadAppointments);
  const lastError = useAppointmentStore((s) => s.lastError);
  const clearError = useAppointmentStore((s) => s.clearError);

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [clinic, setClinic] = useState<"Dabholi" | "City Light">("Dabholi");
  const [date, setDate] = useState(formatLocalDate(new Date()));
  const [time, setTime] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUpcomingDate, setSelectedUpcomingDate] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const { insetPx: keyboardInsetPx, isOpen: isKeyboardOpen } = useKeyboardInset();

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const slots = useMemo(() => generateSlotsFor(clinic), [clinic]);
  const todayStr = formatLocalDate(new Date());

  const filteredPatients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, searchTerm]);

  const todayAppointments = useMemo(
    () => appointments.filter((a) => a.date === todayStr),
    [appointments, todayStr],
  );
  const upcomingAppointments = useMemo(
    () => appointments.filter((a) => a.date > todayStr),
    [appointments, todayStr],
  );

  const uniqueUpcomingDates = useMemo(
    () => Array.from(new Set(upcomingAppointments.map((a) => a.date))).sort(),
    [upcomingAppointments],
  );

  useEffect(() => {
    if (uniqueUpcomingDates.length > 0 && selectedUpcomingDate === "") {
      setSelectedUpcomingDate(uniqueUpcomingDates[0]);
    }
  }, [selectedUpcomingDate, uniqueUpcomingDates]);

  const filteredUpcomingAppointments = useMemo(() => {
    if (!selectedUpcomingDate) return upcomingAppointments;
    return upcomingAppointments.filter((a) => a.date === selectedUpcomingDate);
  }, [selectedUpcomingDate, upcomingAppointments]);

  const todayDabholi = useMemo(
    () => todayAppointments.filter((a) => a.clinic === "Dabholi"),
    [todayAppointments],
  );
  const todayCity = useMemo(
    () => todayAppointments.filter((a) => a.clinic === "City Light"),
    [todayAppointments],
  );
  const futureDabholi = useMemo(
    () => upcomingAppointments.filter((a) => a.clinic === "Dabholi"),
    [upcomingAppointments],
  );
  const futureCity = useMemo(
    () => upcomingAppointments.filter((a) => a.clinic === "City Light"),
    [upcomingAppointments],
  );

  const mobileActionBarHeightPx = 152;
  const mobileActionBarBottom = useMemo(() => {
    if (!isMobile) return "0px";
    if (isKeyboardOpen) return `calc(${keyboardInsetPx}px + 12px)`;
    // Keep a clear separation above BottomNav to avoid any hit-test/overlap on small devices.
    return "calc(80px + env(safe-area-inset-bottom, 0px) + 24px)";
  }, [isKeyboardOpen, isMobile, keyboardInsetPx]);

  const showMobileActionBar = isMobile && Boolean(selectedPatientId);

  // Reminders are queued, never sent directly -- see
  // REMINDER_SYSTEM_AUDIT.md Phase 1/9. Every appointment reminder now
  // goes through the same approve-before-send queue as follow-up
  // reminders (reminderQueueService.ts), with the exact same
  // hasActiveReminder duplicate guard, instead of opening WhatsApp
  // immediately with no review step.
  const buildReminderCandidate = (appt: any): AppointmentReminderCandidate | null => {
    const patient = patients.find((p) => p.id === appt.patientId);
    if (!patient) return null;
    return {
      appointmentId: appt.id,
      patientId: appt.patientId,
      patientName: appt.patientName || patient.name,
      phone: normalizePatientPhone(patient) || undefined,
      date: appt.date,
      time: appt.time,
      clinic: appt.clinic,
    };
  };

  const openReminder = async (appt: any) => {
    const candidate = buildReminderCandidate(appt);
    if (!candidate) return;
    if (!candidate.phone) {
      alert("⚠️ Patient mobile number is missing or invalid.");
      return;
    }
    const result = await queueAppointmentReminders([candidate]);
    if (result.queued.length > 0) {
      alert(`Reminder queued for ${candidate.patientName}. Review and send it from the Reminders page.`);
      onNavigate?.("reminders");
    } else if (result.skippedDuplicate > 0) {
      alert(`${candidate.patientName} already has an active reminder awaiting review in the Reminders page.`);
    }
  };

  const sendAllReminders = async () => {
    // dateKey (dateOnly.ts's canonical local-date helper), not this file's
    // own UTC-based formatLocalDate -- must agree with
    // reminderSchedulerService.ts's getTodayAppointmentReminderCandidates()
    // on what "today" means, or this button and RemindersPage's "Today"
    // section could disagree near midnight IST.
    const today = dateKey(new Date());
    const list = appointments.filter((a) => a.date === today && a.status !== "cancelled" && a.status !== "done" && a.status !== "missed");
    if (list.length === 0) return alert("Notice: No appointments today to remind.");

    const candidates = list
      .map(buildReminderCandidate)
      .filter((c): c is AppointmentReminderCandidate => c !== null);
    const result = await queueAppointmentReminders(candidates);

    const parts: string[] = [];
    if (result.queued.length) parts.push(`${result.queued.length} queued for review`);
    if (result.skippedDuplicate) parts.push(`${result.skippedDuplicate} already have an active reminder`);
    if (result.skippedNoPhone) parts.push(`${result.skippedNoPhone} have no WhatsApp number on file`);
    alert(parts.join("\n") || "Nothing to queue.");

    if (result.queued.length > 0) onNavigate?.("reminders");
  };

  const handleAdd = async () => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return alert("Notice: Patient selection required.");
    if (!date || !time) return alert("Notice: Date and Time selection required.");

    if (isPastDate(date)) return alert("❌ Cannot book past appointment");
    if (isPastDateTime(date, time)) return alert("❌ Cannot book past time slot");
    if (!isValidClinicTime(clinic, time)) {
      return alert(`⏰ Invalid time for ${clinic}\n\nOperating hours: ${getClinicHoursLabel(clinic)}`);
    }
    if (isSlotBooked(date, time, clinic, appointments)) return alert("⚠️ This slot is already booked");

    const success = await addAppointment({
      id: generateId(),
      patientId: patient.id,
      patientName: patient.name,
      clinic,
      date,
      time,
      type: "scheduled",
      status: "booked",
    });

    if (success) {
      const phone = normalizePatientPhone(patient);
      const msg =
        `Sakhi Clinic\n\n` +
        `Dear ${patient.name},\n\n` +
        `Appointment confirmed.\n` +
        `📅 ${date}\n` +
        `⏰ ${time}\n` +
        `🏥 ${clinic}\n\n` +
        `Thank you 🙏`;
      if (phone) openWhatsApp({ phone, message: msg });
      alert("Appointment Secured ✅");
    }

    if (!success) {
      alert(lastError ? `Appointment booking failed: ${lastError}` : "Appointment booking failed. Please retry.");
      clearError();
    }
  };

  const handleWalkIn = async () => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return alert("Clinical Notice: No patient selected for immediate queue.");

    const now = new Date();
    const currentTimeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;
    const success = await addAppointment({
      id: generateId(),
      patientId: patient.id,
      patientName: patient.name,
      clinic,
      date: todayStr,
      time: currentTimeStr,
      type: "walk-in",
      status: "arrived",
    });
    if (!success) {
      alert(lastError ? `Walk-in could not be saved: ${lastError}` : "Walk-in could not be saved. Please retry.");
      clearError();
      return;
    }
    alert(`Priority Walk-in registered at ${currentTimeStr} ✅`);
  };

  const renderSlot = (slot: string, appt: any) => {
    const isWalkIn = appt?.type === "walk-in";
    const status = appt?.status || "available";

    const config = {
      booked: { bg: "#fffbeb", border: "#fef3c7", ink: "#92400e", label: "Scheduled" },
      arrived: { bg: "#eff6ff", border: "#dbeafe", ink: "#1e40af", label: "Arrived" },
      "in-progress": { bg: "#fff1f2", border: "#ffe4e6", ink: "#b91c1c", label: "Consulting" },
      done: { bg: "#f0fdf4", border: "#dcfce7", ink: "#15803d", label: "Completed" },
      available: { bg: "#ffffff", border: "#e2e8f0", ink: "#64748b", label: "Empty Slot" },
    } as const;

    const c = (config as any)[status] || config.available;

    return (
      <div
        key={appt?.id || slot}
        data-testid="appointment-slot-card"
        data-appointment-id={appt?.id}
        data-status={status}
        className="sakhi-slot-card sakhi-tap sakhi-focus-ring sakhi-ripple"
      >
        <div className="min-w-0">
          <div className="sakhi-slot-time">
            {appt ? formatTimeLabel(appt.time) : formatTimeLabel(slot)}
          </div>

          {appt ? (
            <div className="mt-1 min-w-0">
              <div className="truncate text-[12px] font-extrabold text-slate-800">{appt.patientName}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.ink }} />
                <span className="sakhi-slot-sub" style={{ color: c.ink }}>
                  {isWalkIn ? "Walk-in" : c.label}
                </span>
              </div>
            </div>
          ) : (
            <div className="sakhi-slot-sub" style={{ color: c.ink }}>
              {""}
            </div>
          )}
        </div>

        {appt && (
          <div className="sakhi-slot-actions">
            {appt.status === "booked" && (
              <button
                type="button"
                onClick={() => markArrived(appt.id)}
                className="sakhi-slot-actionbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ background: "rgba(2,6,23,0.86)", color: "#fff", borderColor: "rgba(2,6,23,0.0)" }}
              >
                Check-in
              </button>
            )}
            {appt.status !== "done" && (
              <button
                type="button"
                onClick={() => {
                  startConsultation(appt.id);
                  goToConsultation(appt.patientId, appt.id);
                }}
                className="sakhi-slot-actionbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
                style={{ background: "rgba(2,6,23,0.86)", color: "#fff", borderColor: "rgba(2,6,23,0.0)" }}
              >
                <Stethoscope size={14} /> Start
              </button>
            )}
            <button
              type="button"
              onClick={() => openReminder(appt)}
              className="sakhi-slot-actionbtn sakhi-slot-iconbtn sakhi-tap sakhi-focus-ring sakhi-ripple"
              aria-label="Send WhatsApp reminder"
              title="WhatsApp reminder"
            >
              <Smartphone size={18} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer
      className="grid grid-cols-1 gap-4 p-4 md:gap-6 md:p-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-8 lg:p-8"
      style={{
        gridTemplateColumns: "minmax(0,420px) minmax(0,1fr)",
        paddingBottom: showMobileActionBar ? `calc(${mobileActionBarHeightPx}px + 24px)` : undefined,
      }}
    >
      <MobileSection style={{ paddingBottom: showMobileActionBar ? `calc(${mobileActionBarHeightPx}px + 24px)` : undefined }}>
        <MobileCard data-testid="appointment-scheduling-form">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Calendar size={22} className="text-slate-700" />
            </div>
            <div className="min-w-0">
              <div className="sakhi-title">Scheduling</div>
              <div className="sakhi-caption">Fast booking, walk-ins, reminders</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <MobileField>
              <div className="relative">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="appointment-patient-search-input"
                  className="sakhi-input sakhi-tap"
                  style={{ paddingLeft: 44 }}
                  placeholder="Find in registry…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </MobileField>

            <MobileField>
              <div className="sakhi-label">Patient</div>
              <select
                data-testid="appointment-patient-select"
                className="sakhi-input sakhi-tap"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
              >
                <option value="">Select from Registry</option>
                {filteredPatients.slice(0, 25).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({(p as any).phone || "000"})
                  </option>
                ))}
              </select>
            </MobileField>

            <MobileField>
              <div className="sakhi-label">Clinic</div>
              <select
                data-testid="appointment-clinic-select"
                className="sakhi-input sakhi-tap"
                value={clinic}
                onChange={(e) => setClinic(e.target.value as any)}
              >
                <option value="Dabholi">Dabholi (11:00 - 14:00)</option>
                <option value="City Light">City Light (14:30 - 18:30)</option>
              </select>
              <div className="sakhi-caption mt-2">Hours: {getClinicHoursLabel(clinic)}</div>
            </MobileField>

            <ResponsiveGrid columns={2}>
              <MobileField>
                <div className="sakhi-label">Date</div>
                <input
                  data-testid="appointment-date-input"
                  className="sakhi-input sakhi-tap"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ borderColor: isPastDate(date) ? "#ef4444" : undefined }}
                />
                {isPastDate(date) && (
                  <div className="mt-2 flex items-center gap-2 text-[12px] font-extrabold text-red-600">
                    <AlertCircle size={14} /> Past date not allowed
                  </div>
                )}
              </MobileField>
              <MobileField>
                <div className="sakhi-label">Time</div>
                <select
                  data-testid="appointment-time-select"
                  className="sakhi-input sakhi-tap"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                >
                  <option value="">Select Time</option>
                  {slots.map((s) => {
                    const isBooked = isSlotBooked(date, s, clinic, appointments);
                    const isPastTime = date === todayStr && isPastDateTime(date, s);
                    const isDisabled = isBooked || isPastTime;
                    return (
                      <option key={s} value={s} disabled={isDisabled}>
                        {formatTimeLabel(s)}
                        {isBooked ? " — Booked" : isPastTime ? " — Past" : ""}
                      </option>
                    );
                  })}
                </select>
              </MobileField>
            </ResponsiveGrid>

            {!isMobile && (
              <div className="grid gap-3">
                <button type="button" data-testid="appointment-submit-btn" onClick={handleAdd} className="sakhi-btn-primary sakhi-tap sakhi-focus-ring">
                  Secure Appointment Slot
                </button>
                <button type="button" data-testid="appointment-walkin-btn" onClick={handleWalkIn} className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring">
                  Emergency Walk-In Bypass
                </button>
              </div>
            )}
          </div>
        </MobileCard>

        <MobileCard elevated={false}>
          <div className="flex items-center gap-2">
            <BellRing size={18} className="text-amber-600" />
            <div className="sakhi-title">Clinic Command</div>
          </div>

          <button
            type="button"
            onClick={sendAllReminders}
            className="mt-4 w-full sakhi-tap sakhi-focus-ring sakhi-ripple"
            style={{
              minHeight: 52,
              padding: "0 var(--space-3)",
              borderRadius: "var(--radius-3)",
              border: "1px solid rgba(13, 115, 119, 0.18)",
              background: "rgba(13, 115, 119, 0.08)",
              color: "var(--brand-ink)",
              fontSize: 13,
              fontWeight: 950,
            }}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Send size={18} /> Queue Today's Reminders
            </span>
          </button>

          <div className="mt-4 border border-slate-200 bg-slate-50 p-4" style={{ borderRadius: "var(--radius-3)" }}>
            <div className="sakhi-label mb-3">Registry Forecast</div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <span className="sakhi-body">Dabholi AM</span>
                <span className="sakhi-pill">{futureDabholi.length} sessions</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="sakhi-body">City Light PM</span>
                <span className="sakhi-pill">{futureCity.length} sessions</span>
              </div>
            </div>
          </div>
        </MobileCard>
      </MobileSection>

      {showMobileActionBar && (
        <div
          aria-label="Appointment actions"
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: mobileActionBarBottom,
            zIndex: 1100,
          }}
        >
          <div className="grid gap-2 border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur" style={{ borderRadius: "var(--radius-4)" }}>
            <button
              type="button"
              data-testid="appointment-submit-btn"
              onClick={handleAdd}
              className="sakhi-btn-primary sakhi-tap sakhi-focus-ring"
            >
              Secure Appointment Slot
            </button>
            <button
              type="button"
              data-testid="appointment-walkin-btn"
              onClick={handleWalkIn}
              className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
            >
              Emergency Walk-In Bypass
            </button>
          </div>
        </div>
      )}

      <MobileSection style={{ paddingBottom: showMobileActionBar ? `calc(${mobileActionBarHeightPx}px + 24px)` : undefined }}>
        {uniqueUpcomingDates.length > 0 && (
          <MobileCard elevated={false}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="sakhi-title">Upcoming</div>
                <div className="sakhi-caption">Next scheduled appointments</div>
              </div>
              <div className="inline-flex items-center gap-2">
                <div className="sakhi-label">Date</div>
                <select
                  className="sakhi-input sakhi-tap"
                  style={{ width: 160 }}
                  value={selectedUpcomingDate}
                  onChange={(e) => setSelectedUpcomingDate(e.target.value)}
                >
                  {uniqueUpcomingDates.map((d) => (
                    <option key={d} value={d}>
                      {new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {filteredUpcomingAppointments.length > 0 ? (
                filteredUpcomingAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between gap-4 border border-slate-200 bg-white p-4"
                    style={{ borderRadius: "var(--radius-3)" }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-black text-slate-900">{appt.patientName}</div>
                      <div className="mt-1 flex items-center gap-2 text-[12px] font-bold text-slate-600">
                        <span className="sakhi-pill" style={{ padding: "4px 8px" }}>
                          {formatTimeLabel(appt.time)}
                        </span>
                        <span className="sakhi-pill" style={{ padding: "4px 8px" }}>
                          {appt.clinic}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openReminder(appt)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-emerald-700 sakhi-tap sakhi-focus-ring"
                      aria-label="Send WhatsApp reminder"
                    >
                      <Smartphone size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="sakhi-caption">No appointments scheduled for this date.</div>
              )}
            </div>
          </MobileCard>
        )}

        <MobileCard>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="sakhi-title">Roster</div>
              <div className="sakhi-caption">
                {new Date(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div className="mt-2 flex items-center gap-2 text-slate-600">
                <Building2 size={16} className="text-slate-400" />
                <div className="sakhi-caption">Live multi-branch roster</div>
              </div>
            </div>
            <span className="sakhi-pill">{appointments.filter((a) => a.date === date).length} active</span>
          </div>

          {todayAppointments.length > 0 && (
            <div className="mt-4 border border-amber-200 bg-amber-50 p-4" style={{ borderRadius: "var(--radius-3)" }}>
              <div className="flex items-center justify-between">
                <div className="sakhi-body">Today</div>
                <span className="sakhi-pill">{todayAppointments.length}</span>
              </div>
              <div className="mt-3 grid gap-3">
                <ResponsiveGrid columns={2}>
                  <MobileCard elevated={false} style={{ borderColor: "#fde68a", background: "#ffffff" }}>
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl bg-blue-600 p-2">
                        <Layers size={16} className="text-white" />
                      </div>
                  <div className="sakhi-body">Dabholi</div>
                </div>
                <div className="mt-3 sakhi-slot-grid" style={{ maxHeight: "45vh", overflowY: "auto" }}>
                  {todayDabholi.length > 0 ? (
                    todayDabholi.map((appt) => renderSlot(appt.time, appt))
                  ) : (
                    <div className="sakhi-caption">No appointments scheduled.</div>
                  )}
                </div>
              </MobileCard>

                  <MobileCard elevated={false} style={{ borderColor: "#fde68a", background: "#ffffff" }}>
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl bg-emerald-600 p-2">
                        <Layers size={16} className="text-white" />
                      </div>
                  <div className="sakhi-body">City Light</div>
                </div>
                <div className="mt-3 sakhi-slot-grid" style={{ maxHeight: "45vh", overflowY: "auto" }}>
                  {todayCity.length > 0 ? (
                    todayCity.map((appt) => renderSlot(appt.time, appt))
                  ) : (
                    <div className="sakhi-caption">No appointments scheduled.</div>
                  )}
                </div>
              </MobileCard>
                </ResponsiveGrid>
              </div>
            </div>
          )}

          <div className="mt-4">
            <ResponsiveGrid columns={2}>
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-blue-600 p-2">
                    <Layers size={16} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="sakhi-body">Dabholi</div>
                  <div className="sakhi-caption">Morning sessions</div>
                </div>
              </div>
              <div className="mt-3 sakhi-slot-grid" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                {generateSlotsFor("Dabholi").map((slot) => {
                  const appt = appointments.find(
                    (a) => a.date === date && a.time === slot && a.clinic === "Dabholi",
                  );
                  return renderSlot(slot, appt);
                })}
                {appointments
                    .filter(
                      (a) =>
                        a.date === date &&
                        a.clinic === "Dabholi" &&
                        a.type === "walk-in" &&
                        !generateSlotsFor("Dabholi").includes(a.time),
                    )
                    .map((appt) => renderSlot(appt.time, appt))}
              </div>
            </div>

            <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-600 p-2">
                    <Layers size={16} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="sakhi-body">City Light</div>
                  <div className="sakhi-caption">Evening sessions</div>
                </div>
              </div>
              <div className="mt-3 sakhi-slot-grid" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                {generateSlotsFor("City Light").map((slot) => {
                  const appt = appointments.find(
                    (a) => a.date === date && a.time === slot && a.clinic === "City Light",
                  );
                  return renderSlot(slot, appt);
                })}
                  {appointments
                    .filter(
                      (a) =>
                        a.date === date &&
                        a.clinic === "City Light" &&
                        a.type === "walk-in" &&
                        !generateSlotsFor("City Light").includes(a.time),
                    )
                    .map((appt) => renderSlot(appt.time, appt))}
                </div>
              </div>
            </ResponsiveGrid>
          </div>
        </MobileCard>
      </MobileSection>
    </ResponsiveContainer>
  );
}
