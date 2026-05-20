import React, { useState, useEffect, useMemo } from "react";
import { usePatientStore } from "../store/usePatientStore";
import { normalizePatientPhone } from "../utils/whatsapp";
import { useAppointmentStore } from "../store/useAppointmentStore";

// ============================================================
// ICONS - PREMIUM MEDICAL SUITE
// ============================================================
import { 
  Calendar, Clock, MapPin, Plus, CheckCircle, 
  MessageSquare, Send, Zap, ChevronRight, User, Search, 
  AlertCircle, Timer, ShieldCheck, LayoutGrid, Building2,
  BellRing, UserCheck, ArrowRightCircle, Smartphone,
  Stethoscope, RefreshCw, Layers
} from "lucide-react";

/**
 * SAKHI HOMEOPATHIC CLINIC - SMART SCHEDULER (V35.0 PREMIUM REDESIGN)
 * -----------------------------------------------------------------------
 * PROTOCOL : SENIOR UI/UX REDESIGN | ZERO TRUNCATION
 * FEATURES : 1. V6.5 Walk-in Logic (Slot bypass & direct time injection).
 * 2. Sequential WhatsApp (2.5s delay sequencer).
 * 3. 2-Column Professional Clinical Branch Roster.
 * 4. ENHANCED VALIDATION & APPOINTMENT SPLITTING (V7.0)
 * -----------------------------------------------------------------------
 */

type Props = {
  goToConsultation: (patientId: string, appointmentId: string) => void;
};

// ============================================================
// VALIDATION UTILITIES (V7.0 ENHANCEMENT)
// ============================================================

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Check if a given date is in the past
 */
const isPastDate = (dateStr: string): boolean => {
  const selectedDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  selectedDate.setHours(0, 0, 0, 0);
  return selectedDate < today;
};

/**
 * Check if a given date + time is in the past (COMPREHENSIVE CHECK)
 */
const isPastDateTime = (dateStr: string, timeStr: string): boolean => {
  if (!dateStr || !timeStr) return false;
  
  const [hours, minutes] = timeStr.split(":").map(Number);
  const selectedDateTime = new Date(dateStr);
  selectedDateTime.setHours(hours, minutes, 0, 0);
  
  const now = new Date();
  return selectedDateTime < now;
};

/**
 * Validate if time falls within clinic's operating hours
 */
const isValidClinicTime = (clinic: "Dabholi" | "City Light", time: string): boolean => {
  const mins = timeToMinutes(time);
  
  if (clinic === "Dabholi") {
    // 11:00 - 14:00
    return mins >= 11 * 60 && mins < 14 * 60;
  } else {
    // 14:30 - 18:30
    return mins >= 14 * 60 + 30 && mins < 18 * 60 + 30;
  }
};

/**
 * Check if a slot is already booked
 */
const isSlotBooked = (date: string, time: string, clinic: "Dabholi" | "City Light", appointments: any[]): boolean => {
  return appointments.some(
    (a) => a.date === date && a.time === time && a.clinic === clinic && a.type === "scheduled"
  );
};

export default function AppointmentPage({ goToConsultation }: Props) {
  // ================= STORE LINKAGE =================
  const patients = usePatientStore((s) => s.patients);
  const addAppointment = useAppointmentStore((s) => s.addAppointment);
  const appointments = useAppointmentStore((s) => s.appointments);
  const startConsultation = useAppointmentStore((s) => s.startConsultation);
  const markArrived = useAppointmentStore((s) => s.markArrived);
  const markDone = useAppointmentStore((s) => s.markDone);
  const markReminderSent = useAppointmentStore((s) => s.markReminderSent);
  const loadAppointments = useAppointmentStore((s) => s.loadAppointments);

  // ================= INITIAL LOAD =================
  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // ================= COMPONENT STATE =================
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [clinic, setClinic] = useState<"Dabholi" | "City Light">("Dabholi");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUpcomingDate, setSelectedUpcomingDate] = useState("");

  // ================= SLOT GENERATOR (TOTAL INTEGRITY) =================
  const generateSlotsFor = (clinicType: "Dabholi" | "City Light") => {
    const slots: string[] = [];
    let start, end;

    if (clinicType === "Dabholi") {
      start = 11 * 60; // 11:00 AM
      end = 14 * 60;   // 02:00 PM
    } else {
      start = 14 * 60 + 30; // 02:30 PM
      end = 18 * 60 + 30;   // 06:30 PM
    }

    for (let t = start; t < end; t += 10) {
      const h = Math.floor(t / 60);
      const m = t % 60;
      slots.push(`${h}:${m.toString().padStart(2, "0")}`);
    }
    return slots;
  };

  const slots = generateSlotsFor(clinic);

  // ================= WHATSAPP ENGINE (SEQUENTIAL SEQUENCER) =================
  const openReminder = (appt: any) => {
    const patient = patients.find((p) => p.id === appt.patientId);
    if (!patient) return;
    const phone = normalizePatientPhone(patient);
    if (!phone) return;
    const msg = `Reminder – Sakhi Clinic\n\nDear ${patient.name},\n\nThis is a reminder for your appointment today.\n\n⏰ ${appt.time}\n🏥 ${appt.clinic}\n\nPlease arrive on time 🙏`;
    const link = generateWhatsAppLink(phone, msg);
    if (link) window.open(link, "sakhi_whatsapp_window");
    markReminderSent(appt.id);
  };

  // 🔥 V6.5 Logic: Sequential blast with 2.5s delay
  const sendAllReminders = () => {
    const today = new Date().toISOString().split("T")[0];
    const list = appointments.filter((a) => a.date === today && !a.reminderSent);
    if (list.length === 0) return alert("Notice: No clinical reminders pending for today.");

    list.forEach((appt, index) => {
      setTimeout(() => {
        const patient = patients.find((p) => p.id === appt.patientId);
        if (!patient) return;
        const phone = normalizePatientPhone(patient);
        if (!phone) return;
        const msg = `Reminder – Sakhi Clinic\n\nDear ${patient.name},\n\nYour appointment is today at ${appt.time}.\n🏥 ${appt.clinic}\n\nPlease arrive on time 🙏`;
        const link = generateWhatsAppLink(phone, msg);
        if (link) window.open(link, "sakhi_whatsapp_window");
        markReminderSent(appt.id);
      }, index * 2500); 
    });
  };

  // ================= BOOKING ACTIONS =================
  const handleAdd = async () => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return alert("Notice: Patient selection required.");
    if (!date || !time) return alert("Notice: Date and Time selection required.");

    // ✅ VALIDATION 1: Check if date is in the past
    if (isPastDate(date)) {
      return alert("❌ Cannot book past appointment");
    }

    // ✅ VALIDATION 1B: Check if date + time is in the past (COMPREHENSIVE)
    if (isPastDateTime(date, time)) {
      return alert("❌ Cannot book past time slot");
    }

    // ✅ VALIDATION 2: Check if time is valid for clinic
    if (!isValidClinicTime(clinic, time)) {
      const hours = clinic === "Dabholi" ? "11:00 - 14:00" : "14:30 - 18:30";
      return alert(`⏰ Invalid time for ${clinic}\n\nOperating hours: ${hours}`);
    }

    // ✅ VALIDATION 3: Check if slot is already booked
    if (isSlotBooked(date, time, clinic, appointments)) {
      return alert("⚠️ This slot is already booked");
    }

    const success = await addAppointment({
      id: Date.now().toString(),
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
      const msg = `Sakhi Clinic\n\nDear ${patient.name},\n\nAppointment confirmed.\n📅 ${date}\n⏰ ${time}\n🏥 ${clinic}\n\nThank you 🙏`;
      if (phone) window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`);
      alert("Appointment Secured ✅");
    }
  };

  // 🔥 V6.5 CRITICAL WALK-IN LOGIC (BYPASS SLOT CHECK)
  const handleWalkIn = async () => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return alert("Clinical Notice: No patient selected for immediate queue.");

    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentTimeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;

    await addAppointment({
      id: Date.now().toString(),
      patientId: patient.id,
      patientName: patient.name,
      clinic,
      date: todayStr,
      time: currentTimeStr, 
      type: "walk-in",
      status: "arrived",
    });

    alert(`Priority Walk-in registered at ${currentTimeStr} ✅`);
  };

  // ================= UI RENDERERS =================
  const renderSlot = (slot: string, appt: any) => {
    const isWalkIn = appt?.type === "walk-in";
    const status = appt?.status || "available";

    const config = {
      booked: { bg: "#fffbeb", border: "#fef3c7", icon: "#b45309", label: "Scheduled" },
      arrived: { bg: "#eff6ff", border: "#dbeafe", icon: "#1e40af", label: "Arrived" },
      "in-progress": { bg: "#fff1f2", border: "#ffe4e6", icon: "#b91c1c", label: "Consulting" },
      done: { bg: "#f0fdf4", border: "#dcfce7", icon: "#15803d", label: "Completed" },
      available: { bg: "#ffffff", border: "#f1f5f9", icon: "#94a3b8", label: "Empty Slot" }
    }[status];

    return (
      <div key={appt?.id || slot} data-testid="appointment-slot-card" data-appointment-id={appt?.id} style={{ 
        border: `1.5px solid ${config.border}`, padding: "18px", marginBottom: "12px", 
        background: config.bg, borderRadius: "18px", display: "flex", 
        justifyContent: "space-between", alignItems: "center",
        boxShadow: appt ? "0 2px 10px rgba(0,0,0,0.02)" : "none",
        transition: "all 0.2s"
      }}>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <div style={{ textAlign: "center", minWidth: "65px", paddingRight: "15px", borderRight: `2px solid ${config.border}` }}>
            <b style={{ fontSize: "16px", color: "#1e293b", display: "block" }}>{appt ? appt.time : slot}</b>
            <span style={{ fontSize: "9px", color: config.icon, fontWeight: "900", textTransform: "uppercase" }}>{isWalkIn ? "WALK-IN" : "SLOT"}</span>
          </div>
          {appt ? (
            <div>
              <span style={{ fontWeight: "800", fontSize: "16px", color: "#0f172a" }}>{appt.patientName}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                <div style={{ height: "6px", width: "6px", borderRadius: "50%", background: config.icon }}></div>
                <span style={{ fontSize: "11px", fontWeight: "800", color: config.icon, textTransform: "uppercase", letterSpacing: "0.5px" }}>{config.label}</span>
              </div>
            </div>
          ) : (
            <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: "600" }}>Open Appointment Slot</span>
          )}
        </div>

        {appt && (
          <div style={{ display: "flex", gap: "10px" }}>
            {appt.status === "booked" && (
              <button onClick={() => markArrived(appt.id)} style={{ padding: "10px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "800", fontSize: "12px" }}>Check-In</button>
            )}
            {appt.status !== "done" && (
              <button onClick={() => {
                startConsultation(appt.id);
                goToConsultation(appt.patientId, appt.id);
              }} style={{ padding: "10px 16px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "800", fontSize: "12px", display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Stethoscope size={14} /> Start Case
              </button>
            )}
            <button onClick={() => openReminder(appt)} style={{ padding: "10px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", cursor: "pointer", color: "#25d366" }}>
              <Smartphone size={18} />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ================= APPOINTMENT FILTERING (V7.0) =================
  const todayStr = new Date().toISOString().split("T")[0];
  
  // Split appointments into today and upcoming
  const todayAppointments = appointments.filter((a) => a.date === todayStr);
  const upcomingAppointments = appointments.filter((a) => a.date > todayStr);
  
  // ================= UPCOMING DATE FILTERING (V7.2) =================
  // Extract unique dates from upcoming appointments and sort them
  const uniqueUpcomingDates = Array.from(
    new Set(upcomingAppointments.map((a) => a.date))
  ).sort();
  
  // Auto-select first upcoming date on initial load
  useEffect(() => {
    if (uniqueUpcomingDates.length > 0 && selectedUpcomingDate === "") {
      setSelectedUpcomingDate(uniqueUpcomingDates[0]);
    }
  }, [uniqueUpcomingDates, selectedUpcomingDate]);
  
  // Filter upcoming appointments by selected date
  const filteredUpcomingAppointments = selectedUpcomingDate
    ? upcomingAppointments.filter((a) => a.date === selectedUpcomingDate)
    : upcomingAppointments;
  
  // For past displays
  const todayDabholi = todayAppointments.filter((a) => a.clinic === "Dabholi");
  const todayCity = todayAppointments.filter((a) => a.clinic === "City Light");
  const futureDabholi = upcomingAppointments.filter((a) => a.clinic === "Dabholi");
  const futureCity = upcomingAppointments.filter((a) => a.clinic === "City Light");
  
  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const S = {
    container: { display: "grid", gridTemplateColumns: "450px 1fr", gap: "32px", padding: "40px", backgroundColor: "#f4f7f9", minHeight: "100vh", fontFamily: "'Inter', sans-serif" } as React.CSSProperties,
    card: { background: "#fff", borderRadius: "28px", padding: "35px", boxShadow: "0 10px 30px rgba(0,0,0,0.03)", border: "1px solid #eef2f6" } as React.CSSProperties,
    label: { fontSize: "11px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase" as "uppercase", display: "block", marginBottom: "8px", letterSpacing: "1px" } as React.CSSProperties,
    input: { width: "100%", padding: "16px", borderRadius: "14px", border: "1.5px solid #e2e8f0", marginBottom: "16px", outline: "none", fontSize: "15px", backgroundColor: "#fcfdfe" } as React.CSSProperties,
    btnPrimary: { width: "100%", padding: "18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "16px", fontWeight: "800", cursor: "pointer", marginBottom: "12px", boxShadow: "0 10px 20px rgba(37, 99, 235, 0.2)" } as React.CSSProperties
  };

  return (
    <div style={S.container}>
      <style>{`
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .input-focus:focus { border-color: #2563eb !important; background: #fff !important; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.05) !important; }
      `}</style>

      {/* ================= LEFT PANEL: CONTROL CONSOLE ================= */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div data-testid="appointment-scheduling-form" style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "30px" }}>
             <div style={{ background: "#eff6ff", padding: "12px", borderRadius: "14px" }}>
               <Calendar size={24} color="#2563eb" />
             </div>
             <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "900", color: "#0f172a" }}>Scheduling Hub</h2>
          </div>

          <div style={{ position: "relative", marginBottom: "20px" }}>
             <input data-testid="appointment-patient-search-input" className="input-focus" style={{...S.input, paddingLeft: '48px', marginBottom: 0}} placeholder="Find in Registry..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
             <Search size={20} style={{ position: "absolute", left: "16px", top: "16px" }} color="#94a3b8" />
          </div>

          <label style={S.label}>Patient Database Link</label>
          <select data-testid="appointment-patient-select" className="input-focus" style={S.input} value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
            <option value="">Select from Registry</option>
            {filteredPatients.slice(0, 25).map((p) => <option key={p.id} value={p.id}>{p.name} ({(p as any).phone || "000"})</option>)}
          </select>

          <label style={S.label}>Clinic Branch Selection</label>
          <select data-testid="appointment-clinic-select" className="input-focus" style={S.input} value={clinic} onChange={(e) => setClinic(e.target.value as any)}>
            <option value="Dabholi">🏥 Dabholi (11:00 - 14:00)</option>
            <option value="City Light">🏥 City Light (14:30 - 18:30)</option>
          </select>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "12px", marginBottom: "25px" }}>
            <div>
              <label style={S.label}>Date</label>
              <input data-testid="appointment-date-input" className="input-focus" style={{...S.input, marginBottom: 0, borderColor: isPastDate(date) ? "#ef4444" : "#e2e8f0"}} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {isPastDate(date) && (
                <div style={{ fontSize: "11px", color: "#ef4444", fontWeight: "700", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <AlertCircle size={14} /> Cannot book past dates
                </div>
              )}
            </div>
            <div>
              <label style={S.label}>Time Slot</label>
              <select data-testid="appointment-time-select" className="input-focus" style={{...S.input, marginBottom: 0}} value={time} onChange={(e) => setTime(e.target.value)}>
                <option value="">Select Time</option>
                {slots.map((s) => {
                  const isBooked = isSlotBooked(date, s, clinic, appointments);
                  const isValid = isValidClinicTime(clinic, s);
                  const todayStr = new Date().toISOString().split("T")[0];
                  const isPastTime = date === todayStr && isPastDateTime(date, s);
                  const isDisabled = isBooked || isPastTime;
                  
                  return (
                    <option 
                      key={s} 
                      value={s} 
                      disabled={isDisabled}
                      style={{
                        color: isDisabled ? "#d1d5db" : "#1f2937",
                        fontWeight: isDisabled ? "normal" : "500"
                      }}
                    >
                      {s} {isBooked ? "✖ Booked" : isPastTime ? "⏱ Past" : "✔ Available"}
                    </option>
                  );
                })}
              </select>
              {!isValidClinicTime(clinic, time) && time && (
                <div style={{ fontSize: "11px", color: "#f97316", fontWeight: "700", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <AlertCircle size={14} /> Outside clinic hours
                </div>
              )}
            </div>
          </div>

          <button data-testid="appointment-submit-btn" onClick={handleAdd} style={S.btnPrimary}>Secure Appointment Slot</button>
          <button data-testid="appointment-walkin-btn" onClick={handleWalkIn} style={{ ...S.btnPrimary, background: "#f8fafc", color: "#0f172a", border: "1.5px solid #e2e8f0", boxShadow: "none" }}>+ Emergency Walk-In Bypass</button>
        </div>

        {/* OPERATIONS CONSOLE (V6.5 Sequencer Intact) */}
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <BellRing size={20} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "900", color: "#0f172a" }}>Clinic Command</h3>
          </div>
          <button onClick={sendAllReminders} style={{ width: "100%", padding: "18px", background: "#25d366", color: "#fff", border: "none", borderRadius: "16px", fontWeight: "900", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", boxShadow: "0 6px 15px rgba(37, 211, 102, 0.2)" }}>
            <Send size={22} /> Blast Sequential Reminders
          </button>
          
          <div style={{ marginTop: "30px", padding: "20px", background: "#f8fafc", borderRadius: "18px", border: "1px solid #f1f5f9" }}>
            <p style={{ ...S.label, marginBottom: "15px", color: "#64748b" }}>Registry Forecast</p>
            <div style={{ display: "grid", gap: "15px" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: "800", color: "#1e293b" }}>Dabholi AM</span>
                  <span style={{ fontSize: "11px", fontWeight: "900", background: "#eff6ff", color: "#2563eb", padding: "4px 10px", borderRadius: "30px" }}>{futureDabholi.length} SESSIONS</span>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: "800", color: "#1e293b" }}>City Light PM</span>
                  <span style={{ fontSize: "11px", fontWeight: "900", background: "#f0fdf4", color: "#16a34a", padding: "4px 10px", borderRadius: "30px" }}>{futureCity.length} SESSIONS</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= RIGHT PANEL: BRANCH ROSTER ================= */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* ========== TODAY'S APPOINTMENTS (HIGHLIGHTED) ========== */}
        {todayAppointments.length > 0 && (
          <div style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", borderRadius: "28px", padding: "35px", border: "2px solid #fcd34d", boxShadow: "0 10px 30px rgba(252, 211, 77, 0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "950", color: "#92400e", letterSpacing: "-1px" }}>🌅 Today's Appointments</h2>
                <p style={{ margin: "8px 0 0 0", color: "#b45309", fontSize: "14px", fontWeight: "600" }}>{todayStr}</p>
              </div>
              <div style={{ background: "#f59e0b", color: "#fff", padding: "8px 16px", borderRadius: "20px", fontWeight: "900", fontSize: "18px" }}>
                {todayAppointments.length}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
              {/* TODAY - DABHOLI */}
              <div style={{ background: "#fff", borderRadius: "20px", padding: "20px", border: "2px solid #fcd34d" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ background: "#2563eb", padding: "8px", borderRadius: "8px" }}>
                    <Layers size={16} color="#fff" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "900", color: "#1e3a8a" }}>Dabholi (11:00-14:00)</h3>
                </div>
                <div style={{ maxHeight: "45vh", overflowY: "auto", padding: "5px" }}>
                  {todayDabholi.length > 0 ? (
                    todayDabholi.map((appt) => renderSlot(appt.time, appt))
                  ) : (
                    <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px", fontWeight: "600" }}>
                      ✓ No appointments scheduled
                    </div>
                  )}
                </div>
              </div>

              {/* TODAY - CITY LIGHT */}
              <div style={{ background: "#fff", borderRadius: "20px", padding: "20px", border: "2px solid #fcd34d" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ background: "#16a34a", padding: "8px", borderRadius: "8px" }}>
                    <Layers size={16} color="#fff" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "900", color: "#166534" }}>City Light (14:30-18:30)</h3>
                </div>
                <div style={{ maxHeight: "45vh", overflowY: "auto", padding: "5px" }}>
                  {todayCity.length > 0 ? (
                    todayCity.map((appt) => renderSlot(appt.time, appt))
                  ) : (
                    <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px", fontWeight: "600" }}>
                      ✓ No appointments scheduled
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== UPCOMING APPOINTMENTS ========== */}
        {upcomingAppointments.length > 0 && (
          <div style={{ ...S.card, background: "#f8fafc", padding: "35px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "30px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "950", color: "#0f172a", letterSpacing: "-1px" }}>📅 Upcoming Appointments</h2>
                <p style={{ margin: "8px 0 0 0", color: "#64748b", fontSize: "13px", fontWeight: "600" }}>Next {upcomingAppointments.length} scheduled sessions</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={S.label}>Future Bookings</p>
                <p style={{ margin: 0, fontWeight: "950", fontSize: "20px", color: "#0f172a" }}>{upcomingAppointments.length}</p>
              </div>
            </div>

            {/* DATE FILTER DROPDOWN */}
            <div style={{ marginBottom: "24px" }}>
              <label style={S.label}>Filter by Date</label>
              <select 
                className="input-focus" 
                style={{...S.input, marginBottom: 0}} 
                value={selectedUpcomingDate} 
                onChange={(e) => setSelectedUpcomingDate(e.target.value)}
              >
                <option value="">All Upcoming Dates</option>
                {uniqueUpcomingDates.map((d) => {
                  const dateObj = new Date(d);
                  const formatted = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  const count = upcomingAppointments.filter((a) => a.date === d).length;
                  return (
                    <option key={d} value={d}>
                      {formatted} ({count} appointment{count !== 1 ? 's' : ''})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* FILTERED APPOINTMENTS LIST */}
            <div style={{ maxHeight: "50vh", overflowY: "auto", padding: "5px" }}>
              {filteredUpcomingAppointments.length > 0 ? (
                filteredUpcomingAppointments.map((appt) => {
                  const patient = patients.find((p) => p.id === appt.patientId);
                  const statusConfig = {
                    booked: { bg: "#fffbeb", border: "#fef3c7", icon: "#b45309", label: "Scheduled" },
                    arrived: { bg: "#eff6ff", border: "#dbeafe", icon: "#1e40af", label: "Arrived" },
                    "in-progress": { bg: "#fff1f2", border: "#ffe4e6", icon: "#b91c1c", label: "Consulting" },
                    done: { bg: "#f0fdf4", border: "#dcfce7", icon: "#15803d", label: "Completed" },
                  }[appt.status] || { bg: "#f9fafb", border: "#e5e7eb", icon: "#6b7280", label: "Pending" };

                  return (
                    <div 
                      key={appt.id} 
                      style={{ 
                        border: `1.5px solid ${statusConfig.border}`, 
                        padding: "16px", 
                        marginBottom: "12px", 
                        background: statusConfig.bg, 
                        borderRadius: "14px", 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center",
                        transition: "all 0.2s"
                      }}
                    >
                      <div style={{ display: "flex", gap: "15px", alignItems: "center", flex: 1 }}>
                        <div style={{ textAlign: "center", minWidth: "55px", paddingRight: "12px", borderRight: `2px solid ${statusConfig.border}` }}>
                          <b style={{ fontSize: "14px", color: "#1e293b", display: "block" }}>{appt.time}</b>
                          <span style={{ fontSize: "9px", color: statusConfig.icon, fontWeight: "900", textTransform: "uppercase" }}>{appt.clinic}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: "800", fontSize: "14px", color: "#0f172a" }}>{patient?.name || appt.patientName}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                            <div style={{ height: "5px", width: "5px", borderRadius: "50%", background: statusConfig.icon }}></div>
                            <span style={{ fontSize: "10px", fontWeight: "800", color: statusConfig.icon, textTransform: "uppercase", letterSpacing: "0.5px" }}>{statusConfig.label}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", minWidth: "80px", textAlign: "right" }}>
                        {new Date(appt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "14px", fontWeight: "600" }}>
                  ✓ No appointments scheduled for {selectedUpcomingDate ? new Date(selectedUpcomingDate).toLocaleDateString() : "upcoming dates"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROSTER VIEW: Selected Date */}
        <div style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "30px 40px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "950", color: "#0f172a", letterSpacing: "-1px" }}>Roster: {new Date(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
              <Building2 size={16} color="#64748b" />
              <p style={{ margin: 0, color: "#64748b", fontSize: "15px", fontWeight: "600" }}>Live Multi-Branch Roster — Sakhi Clinic Network</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "15px" }}>
            <div style={{ textAlign: "right" }}>
              <p style={S.label}>Total Active Cases</p>
              <p style={{ margin: 0, fontWeight: "950", fontSize: "20px", color: "#0f172a" }}>{appointments.filter(a => a.date === date).length}</p>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
          {/* BRANCH 1: DABHOLI */}
          <div style={{ background: "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", paddingLeft: "10px" }}>
              <div style={{ background: "#2563eb", padding: "8px", borderRadius: "10px" }}>
                <Layers size={18} color="#fff" />
              </div>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "#1e3a8a" }}>Dabholi Branch</h3>
              <span style={{ fontSize: "10px", fontWeight: "900", color: "#2563eb", background: "#eff6ff", padding: "4px 10px", borderRadius: "30px" }}>MORNING SESSIONS</span>
            </div>
            <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "5px" }}>
              {generateSlotsFor("Dabholi").map((slot) => {
                const appt = appointments.find(a => a.date === date && a.time === slot && a.clinic === "Dabholi");
                return renderSlot(slot, appt);
              })}
              {/* Emergency Queue (Walk-ins) logic restored */}
              {appointments
                .filter(a => a.date === date && a.clinic === "Dabholi" && a.type === "walk-in" && !generateSlotsFor("Dabholi").includes(a.time))
                .map(appt => renderSlot(appt.time, appt))
              }
            </div>
          </div>

          {/* BRANCH 2: CITY LIGHT */}
          <div style={{ background: "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", paddingLeft: "10px" }}>
              <div style={{ background: "#16a34a", padding: "8px", borderRadius: "10px" }}>
                <Layers size={18} color="#fff" />
              </div>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "#166534" }}>City Light</h3>
              <span style={{ fontSize: "10px", fontWeight: "900", color: "#16a34a", background: "#f0fdf4", padding: "4px 10px", borderRadius: "30px" }}>EVENING SESSIONS</span>
            </div>
            <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "5px" }}>
              {generateSlotsFor("City Light").map((slot) => {
                const appt = appointments.find(a => a.date === date && a.time === slot && a.clinic === "City Light");
                return renderSlot(slot, appt);
              })}
              {/* Emergency Queue (Walk-ins) logic restored */}
              {appointments
                .filter(a => a.date === date && a.clinic === "City Light" && a.type === "walk-in" && !generateSlotsFor("City Light").includes(a.time))
                .map(appt => renderSlot(appt.time, appt))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}