import type { Consultation } from "../services/db";
import {
  deleteConsultation,
  getAllConsultations,
  getConsultationsByPatient,
  getLastConsultationByPatient,
  saveConsultation,
} from "../services/consultationService";

export const consultationRepository = {
  async listAll(): Promise<Consultation[]> {
    return getAllConsultations();
  },

  async listByPatient(patientId: string): Promise<Consultation[]> {
    return getConsultationsByPatient(patientId);
  },

  async getLastByPatient(patientId: string): Promise<Consultation | null> {
    return getLastConsultationByPatient(patientId);
  },

  async upsert(consultation: Consultation): Promise<boolean> {
    return saveConsultation(consultation);
  },

  async softDelete(id: string): Promise<boolean> {
    return deleteConsultation(id);
  },
};

