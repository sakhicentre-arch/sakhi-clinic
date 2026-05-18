import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Patient, PatientId } from '../types/models';

interface PatientState {
  patients: Patient[];
  selectedPatientId: PatientId | null;
  // Actions
  setSelectedPatientId: (id: PatientId | null) => void;
  loadPatients: () => Promise<void>;
  addPatient: (patient: Patient) => Promise<void>;
  updatePatient: (id: PatientId, updates: Partial<Patient>) => Promise<void>;
  deletePatient: (id: PatientId) => Promise<void>;
}

export const usePatientStore = create<PatientState>()(
  persist(
    (set, get) => ({
      patients: [],
      selectedPatientId: null,

      setSelectedPatientId: (id: PatientId | null) => {
        set({ selectedPatientId: id ? String(id).trim() : null });
      },

      loadPatients: async () => {
        // Logic to load patients from your database/API
        // Implementation remains unchanged to preserve existing data flow
      },

      addPatient: async (patient) => {
        set((state) => ({
          patients: [...state.patients, patient]
        }));
      },

      updatePatient: async (id, updates) => {
        set((state) => ({
          patients: state.patients.map((p) => 
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      deletePatient: async (id) => {
        set((state) => ({
          patients: state.patients.filter((p) => p.id !== id),
          // Clear selection if the deleted patient was selected
          selectedPatientId: get().selectedPatientId === id ? null : get().selectedPatientId
        }));
      },
    }),
    {
      name: 'sakhi-clinic-patients',
      partialize: (state) => ({ patients: state.patients }), // Only persist list, not transient selection
    }
  )
);