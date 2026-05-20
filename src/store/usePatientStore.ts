import { create } from 'zustand';
import type { Patient, PatientId } from '../types/models';
import { getAllPatientsFromDB } from '../services/db';

interface PatientState {
  patients: Patient[];
  selectedPatientId: PatientId | null;
  hydrated: boolean;
  setSelectedPatientId: (id: PatientId | null) => void;
  loadPatients: () => Promise<void>;
  addPatient: (patient: Patient) => Promise<void>;
  updatePatient: (id: PatientId, updates: Partial<Patient>) => Promise<void>;
  deletePatient: (id: PatientId) => Promise<void>;
}

export const usePatientStore = create<PatientState>()((set, get) => ({
  patients: [],
  selectedPatientId: null,
  hydrated: false,

  setSelectedPatientId: (id: PatientId | null) => {
    set({ selectedPatientId: id ? String(id).trim() : null });
  },

  loadPatients: async () => {
    try {
      const list = await getAllPatientsFromDB();
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
}));