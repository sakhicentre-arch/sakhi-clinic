import { Appointment, AppointmentStatus, db } from "./db";
import { broadcastSyncEvent } from "./syncService";

const nowIso = () => new Date().toISOString();
const todayDateString = (): string => new Date().toISOString().slice(0, 10);

const activeAppointments = () => db.appointments.filter((a) => !a.deletedAt);

const canMarkMissed = (status: AppointmentStatus): boolean =>
  status === "booked" || status === "arrived";

const withMetadata = (appointment: Appointment): Appointment => {
  const timestamp = nowIso();
  return {
    ...appointment,
    createdAt: appointment.createdAt || timestamp,
    updatedAt: timestamp,
  };
};

const markOverdueAppointmentsMissed = async (): Promise<void> => {
  const today = todayDateString();
  const overdue = await db.appointments
    .where("date")
    .below(today)
    .filter((appointment) => !appointment.deletedAt && canMarkMissed(appointment.status))
    .toArray();

  await Promise.all(
    overdue.map((appointment) =>
      db.appointments.update(appointment.id, {
        status: "missed",
        updatedAt: nowIso(),
      })
    )
  );
};

const assertValidAppointment = (appointment: Appointment): void => {
  if (!appointment?.id) throw new Error("[AppointmentService] Appointment id is required");
  if (!appointment?.patientId) throw new Error("[AppointmentService] patientId is required");
  if (!appointment?.patientName?.trim()) throw new Error("[AppointmentService] patientName is required");
  if (!appointment?.clinic) throw new Error("[AppointmentService] clinic is required");
  if (!appointment?.date || !/^\d{4}-\d{2}-\d{2}$/.test(appointment.date)) {
    throw new Error("[AppointmentService] date must be YYYY-MM-DD");
  }
  if (!appointment?.time || !/^\d{1,2}:\d{2}$/.test(appointment.time)) {
    throw new Error("[AppointmentService] time must be HH:MM");
  }
  if (!appointment?.type) throw new Error("[AppointmentService] type is required");
  if (!appointment?.status) throw new Error("[AppointmentService] status is required");
};

const checkDuplicate = async (
  date: string,
  time: string,
  clinic: string,
  excludeId?: string
): Promise<Appointment | null> => {
  const existing = await db.appointments
    .where("[date+time+clinic]")
    .equals([date, time, clinic])
    .filter((a) => !a.deletedAt)
    .toArray();

  return existing.find((a) => a.id !== excludeId) || null;
};

export const appointmentService = {
  async getAll(): Promise<Appointment[]> {
    await markOverdueAppointmentsMissed();
    return activeAppointments().toArray();
  },

  async getById(id: string): Promise<Appointment | undefined> {
    if (!id) return undefined;
    await markOverdueAppointmentsMissed();
    const appointment = await db.appointments.get(id);
    return appointment?.deletedAt ? undefined : appointment;
  },

  async getByPatient(patientId: string): Promise<Appointment[]> {
    if (!patientId) return [];
    await markOverdueAppointmentsMissed();
    return db.appointments.where("patientId").equals(patientId).filter((a) => !a.deletedAt).toArray();
  },

  async createAppointment(appointment: Appointment): Promise<boolean> {
    try {
      await markOverdueAppointmentsMissed();
      assertValidAppointment(appointment);

      if (appointment.type === "scheduled") {
        const duplicate = await checkDuplicate(appointment.date, appointment.time, appointment.clinic);
        if (duplicate) throw new Error("[AppointmentService] Slot already booked");
      }

      const existing = await db.appointments.get(appointment.id);
      if (existing && !existing.deletedAt) {
        throw new Error("[AppointmentService] Appointment with this ID already exists");
      }

      await db.appointments.add(withMetadata(appointment));
      broadcastSyncEvent({ type: "appointment:created", payload: { id: appointment.id } });
      return true;
    } catch (error) {
      console.error("[AppointmentService] createAppointment failed:", error);
      throw error;
    }
  },

  async updateAppointment(id: string, changes: Partial<Appointment>): Promise<boolean> {
    try {
      if (!id) throw new Error("[AppointmentService] updateAppointment requires id");
      await markOverdueAppointmentsMissed();

      const existing = await this.getById(id);
      if (!existing) throw new Error("[AppointmentService] Appointment not found");

      const updated = withMetadata({ ...existing, ...changes, id });
      assertValidAppointment(updated);

      const slotChanged = changes.date !== undefined || changes.time !== undefined || changes.clinic !== undefined;
      if (slotChanged && updated.type === "scheduled") {
        const duplicate = await checkDuplicate(updated.date, updated.time, updated.clinic, id);
        if (duplicate) throw new Error("[AppointmentService] Slot already booked");
      }

      await db.appointments.put(updated);
      broadcastSyncEvent({ type: "appointment:updated", payload: { id } });
      return true;
    } catch (error) {
      console.error("[AppointmentService] updateAppointment failed:", error);
      throw error;
    }
  },

  async deleteAppointment(id: string): Promise<boolean> {
    try {
      if (!id) throw new Error("[AppointmentService] deleteAppointment requires id");
      const existing = await this.getById(id);
      if (!existing) throw new Error("[AppointmentService] Appointment not found");
      await db.appointments.update(id, { deletedAt: Date.now(), updatedAt: nowIso() });
      broadcastSyncEvent({ type: "appointment:deleted", payload: { id } });
      return true;
    } catch (error) {
      console.error("[AppointmentService] deleteAppointment failed:", error);
      throw error;
    }
  },

  async add(a: Appointment): Promise<boolean> {
    return this.createAppointment(a);
  },

  async updateStatus(id: string, status: AppointmentStatus): Promise<boolean> {
    try {
      if (!id) throw new Error("[AppointmentService] updateStatus requires id");
      const existing = await this.getById(id);
      if (!existing) throw new Error("[AppointmentService] Appointment not found");
      await db.appointments.update(id, { status, updatedAt: nowIso() });
      broadcastSyncEvent({ type: "appointment:updated", payload: { id } });
      return true;
    } catch (error) {
      console.error("[AppointmentService] updateStatus failed:", error);
      throw error;
    }
  },

  async getByDate(date: string): Promise<Appointment[]> {
    if (!date) return [];
    await markOverdueAppointmentsMissed();
    return db.appointments.where("date").equals(date).filter((a) => !a.deletedAt).toArray();
  },

  async markReminder(id: string): Promise<boolean> {
    try {
      if (!id) throw new Error("[AppointmentService] markReminder requires id");
      const existing = await this.getById(id);
      if (!existing) throw new Error("[AppointmentService] Appointment not found");
      await db.appointments.update(id, { reminderSent: true, updatedAt: nowIso() });
      return true;
    } catch (error) {
      console.error("[AppointmentService] markReminder failed:", error);
      throw error;
    }
  },

  async markOverdueMissed(): Promise<void> {
    await markOverdueAppointmentsMissed();
  },

  async getByClinic(clinic: Appointment["clinic"]): Promise<Appointment[]> {
    if (!clinic) return [];
    await markOverdueAppointmentsMissed();
    return db.appointments.where("clinic").equals(clinic).filter((a) => !a.deletedAt).toArray();
  },

  async getByClinicAndDate(clinic: Appointment["clinic"], date: string): Promise<Appointment[]> {
    if (!clinic || !date) return [];
    await markOverdueAppointmentsMissed();
    return db.appointments.where("[clinic+date]").equals([clinic, date]).filter((a) => !a.deletedAt).toArray();
  },

  async getAvailableSlots(clinic: Appointment["clinic"], date: string, slots: string[]): Promise<string[]> {
    if (!clinic || !date || !slots?.length) return [];
    const booked = await this.getByClinicAndDate(clinic, date);
    const bookedTimes = new Set(booked.map((a) => a.time));
    return slots.filter((slot) => !bookedTimes.has(slot));
  },

  async countByStatus(status: AppointmentStatus): Promise<number> {
    if (!status) return 0;
    const all = await activeAppointments().toArray();
    return all.filter((a) => a.status === status).length;
  },
};
