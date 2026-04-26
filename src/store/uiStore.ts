import { create } from "zustand";

// FIXED: Added "print" — used in App.tsx goToPrint()
export type ActivePage = "today" | "patients" | "appointments" | "consultation" | "revenue" | "settings" | "print";
export type ActiveClinic = "Dabholi" | "City Light";

type UIStore = {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;

  activeClinic: ActiveClinic;
  setActiveClinic: (clinic: ActiveClinic) => void;

  activePatientId: string | null;
  setActivePatientId: (id: string | null) => void;

  activeAppointmentId: string | null;
  setActiveAppointmentId: (id: string | null) => void;

  // FIXED: Added — used in App.tsx goToConsultation()
  setActiveConsultation: (patientId: string, appointmentId: string) => void;

  globalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  draftStatus: string;
  setDraftStatus: (status: string) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  activePage: "today",
  setActivePage: (page) => set({ activePage: page }),

  activeClinic: "Dabholi",
  setActiveClinic: (clinic) => set({ activeClinic: clinic }),

  activePatientId: null,
  setActivePatientId: (id) => set({ activePatientId: id }),

  activeAppointmentId: null,
  setActiveAppointmentId: (id) => set({ activeAppointmentId: id }),

  // FIXED: Sets both patient and appointment at once — used when opening consultation
  setActiveConsultation: (patientId, appointmentId) =>
    set({ activePatientId: patientId, activeAppointmentId: appointmentId }),

  globalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  draftStatus: "",
  setDraftStatus: (status) => set({ draftStatus: status }),
}));
