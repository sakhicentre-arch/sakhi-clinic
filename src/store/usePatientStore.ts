import { create } from 'zustand';
import type { Patient, PatientId } from '../types/models';
import { patientRepository } from '../repositories/patientRepository';
import { subscribeToSync } from '../services/syncService';

interface PatientState {
  patients: Patient[];
  selectedPatientId: PatientId | null;
  hydrated: boolean;
  // Module A: parity with useAppointmentStore's lastError. Set directly by
  // PatientPage.tsx alongside its existing alert() on a save/delete failure —
  // gives write-failure state a consistent, assertable shape across stores,
  // rather than only a browser alert() that a test can't observe.
  lastError: string | null;
  setSelectedPatientId: (id: PatientId | null) => void;
  loadPatients: () => Promise<void>;
  addPatient: (patient: Patient) => Promise<void>;
  updatePatient: (id: PatientId, updates: Partial<Patient>) => Promise<void>;
  deletePatient: (id: PatientId) => Promise<void>;
  setLastError: (message: string | null) => void;
  clearError: () => void;
}

export const usePatientStore = create<PatientState>()((set, get) => ({
  patients: [],
  selectedPatientId: null,
  hydrated: false,
  lastError: null,

  setSelectedPatientId: (id: PatientId | null) => {
    set({ selectedPatientId: id ? String(id).trim() : null });
  },

  loadPatients: async () => {
    try {
      const list = await patientRepository.list();
      // Merge canonical DB results with any existing transient-only patients
      const existing = get().patients || [];
      const byId = new Map<string, any>();
      (list || []).forEach((p) => byId.set(String(p.id), p));
      existing.forEach((p) => {
        if (!byId.has(String(p.id))) byId.set(String(p.id), p);
      });
      const merged = Array.from(byId.values());
      set({ patients: merged, hydrated: true });
    } catch (error) {
      console.error('[usePatientStore] loadPatients failed:', error);
      set({ patients: [], hydrated: true });
    }
  },

  addPatient: async (patient) => {
    set((state) => ({ patients: [...state.patients, patient] }));
  },

  updatePatient: async (id, updates) => {
    set((state) => ({
      patients: state.patients.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  deletePatient: async (id) => {
    set((state) => ({
      patients: state.patients.filter((p) => p.id !== id),
      selectedPatientId: get().selectedPatientId === id ? null : get().selectedPatientId,
    }));
  },

  setLastError: (message) => set({ lastError: message }),
  clearError: () => set({ lastError: null }),
}));

if (typeof window !== "undefined") {
  subscribeToSync(async (message) => {
    if (!message.payload || typeof message.payload !== "object") return;

    switch (message.type) {
      case "patient:created": {
        const patientId = String((message.payload as any).id || "");
        const patient = await patientRepository.getById(patientId);
        if (patient && !patient.deletedAt) {
          usePatientStore.setState((state) => {
            if (state.patients.some((p) => p.id === patient.id)) return {};
            return { patients: [...state.patients, patient] };
          });
        }
        break;
      }
      case "patient:updated": {
        const patientId = String((message.payload as any).id || "");
        const patient = await patientRepository.getById(patientId);
        if (patient) {
          usePatientStore.setState((state) => {
            const existing = state.patients.some((p) => p.id === patientId);
            return {
              patients: existing
                ? state.patients.map((p) => (p.id === patientId ? patient : p))
                : [...state.patients, patient],
            };
          });
        }
        break;
      }
      case "patient:deleted": {
        const patientId = String((message.payload as any).id || "");
        usePatientStore.setState((state) => ({
          patients: state.patients.filter((p) => p.id !== patientId),
          selectedPatientId: state.selectedPatientId === patientId ? null : state.selectedPatientId,
        }));
        break;
      }
      case "patient:restored": {
        const patientId = String((message.payload as any).id || "");
        const patient = await patientRepository.getById(patientId);
        if (patient && !patient.deletedAt) {
          usePatientStore.setState((state) => ({
            patients: state.patients.some((p) => p.id === patient.id)
              ? state.patients
              : [...state.patients, patient],
          }));
        }
        break;
      }
      default:
        break;
    }
  });
}
