import { db, Appointment } from "./db";

type AppointmentStatus = Appointment["status"] | "missed";

const todayDateString = (): string => new Date().toISOString().slice(0, 10);

const canMarkMissed = (status: AppointmentStatus): boolean =>
  status === "booked" || status === "arrived";

const markOverdueAppointmentsMissed = async (): Promise<void> => {
  const today = todayDateString();
  const overdue = await db.appointments
    .where("date")
    .below(today)
    .toArray();

  await Promise.all(
    overdue
      .filter((appointment) => canMarkMissed(appointment.status as AppointmentStatus))
      .map((appointment) =>
        db.appointments.update(appointment.id, {
          status: "missed" as Appointment["status"],
        })
      )
  );
};

const isValidAppointment = (appointment: Appointment): boolean => {
  if (!appointment?.id) return false;
  if (!appointment?.patientId) return false;
  if (!appointment?.patientName?.trim()) return false;
  if (!appointment?.clinic) return false;
  if (!appointment?.date) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment.date)) return false;
  if (!appointment?.time) return false;
  if (!/^\d{2}:\d{2}$/.test(appointment.time)) return false;
  if (!appointment?.type) return false;
  if (!appointment?.status) return false;
  return true;
};

const checkDuplicate = async (
  date: string,
  time: string,
  clinic: string,
  excludeId?: string
): Promise<Appointment | null> => {
  const existing = await db.appointments
    .where({
      date,
      time,
      clinic,
    })
    .toArray();

  const duplicates = existing.filter((a) => a.id !== excludeId);
  return duplicates.length > 0 ? duplicates[0] : null;
};

export const appointmentService = {
  // ================= GET ALL =================
  async getAll(): Promise<Appointment[]> {
    await markOverdueAppointmentsMissed();
    return await db.appointments.toArray();
  },

  // ================= GET BY ID =================
  async getById(id: string): Promise<Appointment | undefined> {
    if (!id) return undefined;
    await markOverdueAppointmentsMissed();
    return await db.appointments.get(id);
  },

  // ================= GET BY PATIENT =================
  async getByPatient(patientId: string): Promise<Appointment[]> {
    if (!patientId) return [];
    await markOverdueAppointmentsMissed();
    return await db.appointments.where("patientId").equals(patientId).toArray();
  },

  // ================= CREATE APPOINTMENT =================
  async createAppointment(appointment: Appointment): Promise<boolean> {
    try {
      await markOverdueAppointmentsMissed();

      if (!isValidAppointment(appointment)) {
        console.error("[AppointmentService] Invalid appointment data");
        return false;
      }

      if (appointment.type === "scheduled") {
        const duplicate = await checkDuplicate(
          appointment.date,
          appointment.time,
          appointment.clinic
        );
        if (duplicate) {
          console.warn("[AppointmentService] Slot already booked");
          return false;
        }
      }

      const existing = await db.appointments.get(appointment.id);
      if (existing) {
        console.error("[AppointmentService] Appointment with this ID already exists");
        return false;
      }

      await db.appointments.add(appointment);
      return true;
    } catch (error) {
      console.error("[AppointmentService] createAppointment failed:", error);
      return false;
    }
  },

  // ================= UPDATE APPOINTMENT =================
  async updateAppointment(id: string, changes: Partial<Appointment>): Promise<boolean> {
    try {
      if (!id) {
        console.error("[AppointmentService] updateAppointment requires id");
        return false;
      }

      await markOverdueAppointmentsMissed();

      const existing = await db.appointments.get(id);
      if (!existing) {
        console.error("[AppointmentService] Appointment not found");
        return false;
      }

      const updated = { ...existing, ...changes, id };

      if (!isValidAppointment(updated)) {
        console.error("[AppointmentService] Invalid appointment data after update");
        return false;
      }

      const slotChanged =
        changes.date !== undefined ||
        changes.time !== undefined ||
        changes.clinic !== undefined;

      if (slotChanged && updated.type === "scheduled") {
        const duplicate = await checkDuplicate(
          updated.date,
          updated.time,
          updated.clinic,
          id
        );
        if (duplicate) {
          console.warn("[AppointmentService] Slot already booked");
          return false;
        }
      }

      await db.appointments.update(id, updated);
      return true;
    } catch (error) {
      console.error("[AppointmentService] updateAppointment failed:", error);
      return false;
    }
  },

  // ================= DELETE APPOINTMENT =================
  async deleteAppointment(id: string): Promise<boolean> {
    try {
      if (!id) {
        console.error("[AppointmentService] deleteAppointment requires id");
        return false;
      }

      const existing = await db.appointments.get(id);
      if (!existing) {
        console.warn("[AppointmentService] Appointment not found");
        return false;
      }

      await db.appointments.delete(id);
      return true;
    } catch (error) {
      console.error("[AppointmentService] deleteAppointment failed:", error);
      return false;
    }
  },

  // ================= ADD (LEGACY) =================
  async add(a: Appointment): Promise<boolean> {
    await markOverdueAppointmentsMissed();

    const exists = await db.appointments
      .where({
        date: a.date,
        time: a.time,
        clinic: a.clinic,
      })
      .first();

    if (exists && exists.id !== a.id && a.type === "scheduled") {
      alert("Slot already booked.");
      return false;
    }

    await db.appointments.put(a);
    return true;
  },

  // ================= UPDATE STATUS =================
  async updateStatus(id: string, status: AppointmentStatus): Promise<boolean> {
    try {
      if (!id) {
        console.error("[AppointmentService] updateStatus requires id");
        return false;
      }

      const existing = await db.appointments.get(id);
      if (!existing) {
        console.error("[AppointmentService] Appointment not found");
        return false;
      }

      await db.appointments.update(id, { status });
      return true;
    } catch (error) {
      console.error("[AppointmentService] updateStatus failed:", error);
      return false;
    }
  },

  // ================= GET BY DATE =================
  async getByDate(date: string): Promise<Appointment[]> {
    if (!date) return [];
    await markOverdueAppointmentsMissed();
    return await db.appointments.where("date").equals(date).toArray();
  },

  // ================= MARK REMINDER SENT =================
  async markReminder(id: string): Promise<boolean> {
    try {
      if (!id) {
        console.error("[AppointmentService] markReminder requires id");
        return false;
      }

      const existing = await db.appointments.get(id);
      if (!existing) {
        console.warn("[AppointmentService] Appointment not found");
        return false;
      }

      await db.appointments.update(id, { reminderSent: true });
      return true;
    } catch (error) {
      console.error("[AppointmentService] markReminder failed:", error);
      return false;
    }
  },

  // ================= MARK OVERDUE MISSED =================
  async markOverdueMissed(): Promise<void> {
    await markOverdueAppointmentsMissed();
  },

  // ================= GET BY CLINIC =================
  async getByClinic(clinic: "Dabholi" | "City Light"): Promise<Appointment[]> {
    if (!clinic) return [];
    await markOverdueAppointmentsMissed();
    return await db.appointments.where("clinic").equals(clinic).toArray();
  },

  // ================= GET BY CLINIC AND DATE =================
  async getByClinicAndDate(
    clinic: "Dabholi" | "City Light",
    date: string
  ): Promise<Appointment[]> {
    if (!clinic || !date) return [];
    await markOverdueAppointmentsMissed();
    const all = await db.appointments.where("date").equals(date).toArray();
    return all.filter((a) => a.clinic === clinic);
  },

  // ================= GET AVAILABLE SLOTS =================
  async getAvailableSlots(
    clinic: "Dabholi" | "City Light",
    date: string,
    slots: string[]
  ): Promise<string[]> {
    if (!clinic || !date || !slots || slots.length === 0) return [];

    const booked = await db.appointments
      .where({
        clinic,
        date,
      })
      .toArray();

    const bookedTimes = new Set(booked.map((a) => a.time));
    return slots.filter((slot) => !bookedTimes.has(slot));
  },

  // ================= COUNT BY STATUS =================
  async countByStatus(status: AppointmentStatus): Promise<number> {
    try {
      if (!status) return 0;
      const all = await db.appointments.toArray();
      return all.filter((a) => a.status === status).length;
    } catch (error) {
      console.error("[AppointmentService] countByStatus failed:", error);
      return 0;
    }
  },
};