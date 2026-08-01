import { Appointment, AppointmentStatus, db } from "./db";
import { broadcastSyncEvent } from "./syncService";
import { getDeviceId } from "../utils/deviceId";
import { enqueueOutbox } from "./outboxService";
import { captureOperationError, logOperationAttempt, logOperationSuccess } from "./runtimeErrorCaptureService";

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
    version: typeof appointment.version === "number" ? appointment.version + 1 : 1,
    deviceId: appointment.deviceId || getDeviceId(),
    syncStatus: appointment.syncStatus || "local",
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
    await logOperationAttempt({
      op: "appointment.create",
      message: "Appointment create attempt",
      payload: { id: appointment?.id, patientId: appointment?.patientId, clinic: appointment?.clinic, date: appointment?.date, time: appointment?.time, type: appointment?.type },
    });

    let localPersisted = false;
    let created: Appointment | null = null;
    try {
      await markOverdueAppointmentsMissed();
      assertValidAppointment(appointment);

      created = withMetadata(appointment);
      // The duplicate-slot check and the id-collision check must run inside the
      // SAME rw transaction as the insert, not before it. IndexedDB serializes
      // concurrent rw transactions on a given object store, so a check and
      // write that both live inside one transaction are atomic with respect to
      // any other transaction on db.appointments. Reading the check result
      // before opening the transaction (the previous shape) left a window
      // where two near-simultaneous bookings could both pass the check and
      // both insert, double-booking the slot.
      await db.transaction("rw", [db.appointments, db.syncOutbox], async () => {
        if (appointment.type === "scheduled") {
          const duplicate = await checkDuplicate(appointment.date, appointment.time, appointment.clinic);
          if (duplicate) throw new Error("This slot was just taken by another booking. Please choose a different time.");
        }

        const existing = await db.appointments.get(appointment.id);
        if (existing && !existing.deletedAt) {
          throw new Error("[AppointmentService] Appointment with this ID already exists");
        }

        await db.appointments.add(created as Appointment);
        try {
          await enqueueOutbox({
            entityType: "appointment",
            entityId: (created as Appointment).id,
            operationType: "create",
            payload: created as Appointment,
            version: (created as Appointment).version || 1,
          });
        } catch (err) {
          console.warn("[AppointmentService] outbox enqueue failed:", err);
        }
      });

      // IndexedDB transaction committed successfully.
      localPersisted = true;

      // Post-save side effects must never turn a local save into a failure.
      try {
        broadcastSyncEvent({ type: "appointment:created", payload: { id: appointment.id } });
      } catch (err) {
        console.warn("[AppointmentService] broadcastSyncEvent failed:", err);
      }
      try {
        await logOperationSuccess({
          op: "appointment.create",
          message: "Appointment created",
          data: { id: appointment.id, patientId: appointment.patientId, date: appointment.date, time: appointment.time, clinic: appointment.clinic },
        });
      } catch (err) {
        console.warn("[AppointmentService] logOperationSuccess failed:", err);
      }
      return true;
    } catch (error) {
      if (localPersisted) {
        console.warn("[AppointmentService] Non-critical post-save failure after local persistence:", error);
        await captureOperationError({
          op: "appointment.create",
          message: "Post-save failure after local persistence",
          error,
          payload: { id: created?.id || appointment?.id, patientId: created?.patientId || appointment?.patientId, clinic: created?.clinic || appointment?.clinic, date: created?.date || appointment?.date, time: created?.time || appointment?.time, type: created?.type || appointment?.type },
        }).catch(() => {});
        return true;
      }

      console.error("[AppointmentService] createAppointment failed:", error);
      await captureOperationError({
        op: "appointment.create",
        message: "Appointment create failed",
        error,
        payload: { id: appointment?.id, patientId: appointment?.patientId, clinic: appointment?.clinic, date: appointment?.date, time: appointment?.time, type: appointment?.type },
      }).catch(() => {});
      throw error;
    }
  },

  async updateAppointment(id: string, changes: Partial<Appointment>): Promise<boolean> {
    await logOperationAttempt({
      op: "appointment.update",
      message: "Appointment update attempt",
      payload: { id, changes },
    });

    let localPersisted = false;
    let updated: Appointment | null = null;
    try {
      if (!id) throw new Error("[AppointmentService] updateAppointment requires id");
      await markOverdueAppointmentsMissed();

      const existing = await this.getById(id);
      if (!existing) throw new Error("[AppointmentService] Appointment not found");

      updated = withMetadata({ ...existing, ...changes, id });
      assertValidAppointment(updated as Appointment);

      const slotChanged = changes.date !== undefined || changes.time !== undefined || changes.clinic !== undefined;
      if (slotChanged && updated.type === "scheduled") {
        const duplicate = await checkDuplicate(updated.date, updated.time, updated.clinic, id);
        if (duplicate) throw new Error("[AppointmentService] Slot already booked");
      }

      await db.transaction("rw", [db.appointments, db.syncOutbox], async () => {
        await db.appointments.put(updated as Appointment);
        try {
          await enqueueOutbox({
            entityType: "appointment",
            entityId: id,
            operationType: "update",
            payload: updated as Appointment,
            version: (updated as Appointment).version || 1,
          });
        } catch (err) {
          console.warn("[AppointmentService] outbox enqueue failed:", err);
        }
      });

      localPersisted = true;

      try {
        broadcastSyncEvent({ type: "appointment:updated", payload: { id } });
      } catch (err) {
        console.warn("[AppointmentService] broadcastSyncEvent failed:", err);
      }
      try {
        await logOperationSuccess({
          op: "appointment.update",
          message: "Appointment updated",
          data: { id, patientId: (updated as Appointment).patientId, date: (updated as Appointment).date, time: (updated as Appointment).time, clinic: (updated as Appointment).clinic, status: (updated as Appointment).status },
        });
      } catch (err) {
        console.warn("[AppointmentService] logOperationSuccess failed:", err);
      }
      return true;
    } catch (error) {
      if (localPersisted) {
        console.warn("[AppointmentService] Non-critical post-save failure after local persistence:", error);
        await captureOperationError({
          op: "appointment.update",
          message: "Post-save failure after local persistence",
          error,
          payload: { id, changes, patientId: updated?.patientId, date: updated?.date, time: updated?.time, clinic: updated?.clinic },
        }).catch(() => {});
        return true;
      }

      console.error("[AppointmentService] updateAppointment failed:", error);
      await captureOperationError({
        op: "appointment.update",
        message: "Appointment update failed",
        error,
        payload: { id, changes },
      }).catch(() => {});
      throw error;
    }
  },

  async deleteAppointment(id: string): Promise<boolean> {
    try {
      if (!id) throw new Error("[AppointmentService] deleteAppointment requires id");
      const existing = await this.getById(id);
      if (!existing) throw new Error("[AppointmentService] Appointment not found");
      const deletedAt = Date.now();
      await db.transaction("rw", [db.appointments, db.syncOutbox], async () => {
        await db.appointments.update(id, { deletedAt, updatedAt: nowIso() });
        try {
          await enqueueOutbox({
            entityType: "appointment",
            entityId: id,
            operationType: "delete",
            payload: { id, deletedAt },
            version: typeof (existing as any).version === "number" ? (existing as any).version + 1 : 1,
          });
        } catch (err) {
          console.warn("[AppointmentService] outbox enqueue failed:", err);
        }
      });
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
      const updated = withMetadata({ ...existing, status });
      await db.transaction("rw", [db.appointments, db.syncOutbox], async () => {
        await db.appointments.put(updated);
        try {
          await enqueueOutbox({
            entityType: "appointment",
            entityId: id,
            operationType: "update",
            payload: updated,
            version: updated.version || 1,
          });
        } catch (err) {
          console.warn("[AppointmentService] outbox enqueue failed:", err);
        }
      });
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
