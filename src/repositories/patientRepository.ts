import type { Patient } from "../services/db";
import { addPatient, deletePatient, getAllPatients, getPatientById, updatePatient } from "../services/patientService";

export const patientRepository = {
  async list(): Promise<Patient[]> {
    return getAllPatients();
  },

  async getById(id: string): Promise<Patient | undefined> {
    return getPatientById(id);
  },

  async create(patient: Patient): Promise<void> {
    await addPatient(patient);
  },

  async update(id: string, updates: Partial<Patient>): Promise<void> {
    await updatePatient(id, updates);
  },

  async softDelete(id: string): Promise<void> {
    await deletePatient(id);
  },
};

