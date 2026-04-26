import { create } from "zustand";
import { Appointment } from "../services/db";
import { appointmentService } from "../services/appointmentService";

type AppointmentStore = {
  appointments: Appointment[];

  loadAppointments: () => Promise<void>;

  addAppointment: (a: Appointment) => Promise<boolean>;
  startConsultation: (id: string) => Promise<void>;

  markArrived: (id: string) => Promise<void>;
  markDone: (id: string) => Promise<void>;
  markReminderSent: (id: string) => Promise<void>;
};

export const useAppointmentStore = create<AppointmentStore>((set, get) => ({
  appointments: [],

  // ================= LOAD =================
  loadAppointments: async () => {
    const data = await appointmentService.getAll();
    set({ appointments: data });
  },

  // ================= ADD =================
  addAppointment: async (a) => {
    const success = await appointmentService.add(a);
    if (!success) return false;

    set((state) => ({
      appointments: [...state.appointments, a],
    }));

    return true;
  },

  // ================= START =================
  startConsultation: async (id) => {
    await appointmentService.updateStatus(id, "in-progress");

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, status: "in-progress" } : a
      ),
    }));
  },

  // ================= ARRIVED =================
  markArrived: async (id) => {
    await appointmentService.updateStatus(id, "arrived");

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, status: "arrived" } : a
      ),
    }));
  },

  // ================= DONE =================
  markDone: async (id) => {
    await appointmentService.updateStatus(id, "done");

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, status: "done" } : a
      ),
    }));
  },

  // ================= REMINDER =================
  markReminderSent: async (id) => {
    await appointmentService.markReminder(id);

    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, reminderSent: true } : a
      ),
    }));
  },
}));