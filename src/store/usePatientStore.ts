import { create } from "zustand";
import { db, Patient } from "../services/db";

/**
 * SAKHI CLINIC — PATIENT STORE (V2.0)
 * PROTOCOL: TYPE SYNCHRONIZATION
 */

type PatientStore = {
  patients: Patient[];
  loadPatients: () => Promise<void>;
  addPatient: (p: Patient) => Promise<void>;
  updatePatient: (id: string, updates: Partial<Patient>) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
};

export const usePatientStore = create<PatientStore>((set) => ({
  patients: [],

  loadPatients: async () => {
    const data = await db.patients.toArray();
    set({ patients: data });
  },

  addPatient: async (p) => {
    await db.patients.add(p);
    set((state) => ({
      patients: [...state.patients, p],
    }));
  },

  updatePatient: async (id, updates) => {
    await db.patients.update(id, updates);
    set((state) => ({
      patients: state.patients.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  },

  deletePatient: async (id) => {
    await db.patients.delete(id);
    set((state) => ({
      patients: state.patients.filter((p) => p.id !== id),
    }));
  },
}));

export type { Patient };