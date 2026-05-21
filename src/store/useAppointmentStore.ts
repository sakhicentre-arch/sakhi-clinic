import { create } from "zustand";
import { db, Appointment } from "../services/db";
import { appointmentService } from "../services/appointmentService";
import { subscribeToSync } from "../services/syncService";

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

type AppointmentStore = {
  appointments: Appointment[];
  lastError: string | null;

  loadAppointments: () => Promise<void>;

  addAppointment: (a: Appointment) => Promise<boolean>;
  startConsultation: (id: string) => Promise<void>;

  markArrived: (id: string) => Promise<void>;
  markDone: (id: string) => Promise<void>;
  markReminderSent: (id: string) => Promise<void>;
  clearError: () => void;
};

export const useAppointmentStore = create<AppointmentStore>((set, get) => ({
  appointments: [],
  lastError: null,

  // ================= LOAD =================
  loadAppointments: async () => {
    try {
      const data = await appointmentService.getAll();
      set({ appointments: data, lastError: null });
    } catch (error) {
      console.error("[AppointmentStore] loadAppointments failed:", error);
      set({ lastError: toErrorMessage(error) });
      throw error;
    }
  },

  // ================= ADD =================
  addAppointment: async (a) => {
    try {
      const success = await appointmentService.add(a);
      if (!success) {
        set({ lastError: "Appointment save failed without a service result." });
        return false;
      }

      set((state) => ({
        appointments: [...state.appointments, a],
        lastError: null,
      }));

      return true;
    } catch (error) {
      console.error("[AppointmentStore] addAppointment failed:", error);
      set({ lastError: toErrorMessage(error) });
      return false;
    }
  },

  // ================= START =================
  startConsultation: async (id) => {
    await appointmentService.updateStatus(id, "in-progress");

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, status: "in-progress" } : a
      ),
      lastError: null,
    }));
  },

  // ================= ARRIVED =================
  markArrived: async (id) => {
    await appointmentService.updateStatus(id, "arrived");

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, status: "arrived" } : a
      ),
      lastError: null,
    }));
  },

  // ================= DONE =================
  markDone: async (id) => {
    await appointmentService.updateStatus(id, "done");

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, status: "done" } : a
      ),
      lastError: null,
    }));
  },

  // ================= REMINDER =================
  markReminderSent: async (id) => {
    await appointmentService.markReminder(id);

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, reminderSent: true } : a
      ),
      lastError: null,
    }));
  },

  clearError: () => set({ lastError: null }),
}));

if (typeof window !== "undefined") {
  subscribeToSync(async (message) => {
    if (!message.payload || typeof message.payload !== "object") return;
    const appointmentId = String((message.payload as any).id || "");
    if (!appointmentId) return;

    switch (message.type) {
      case "appointment:created": {
        const appointment = await db.appointments.get(appointmentId);
        if (appointment && !appointment.deletedAt) {
          useAppointmentStore.setState((state) => {
            if (state.appointments.some((a) => a.id === appointment.id)) return {};
            return { appointments: [...state.appointments, appointment] };
          });
        }
        break;
      }
      case "appointment:updated": {
        const appointment = await db.appointments.get(appointmentId);
        if (appointment) {
          useAppointmentStore.setState((state) => ({
            appointments: state.appointments.map((a) =>
              a.id === appointmentId ? appointment : a
            ),
          }));
        }
        break;
      }
      case "appointment:deleted": {
        useAppointmentStore.setState((state) => ({
          appointments: state.appointments.filter((a) => a.id !== appointmentId),
        }));
        break;
      }
      default:
        break;
    }
  });
}

