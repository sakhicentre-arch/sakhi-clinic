import type { Appointment, AppointmentStatus } from "../services/db";
import { appointmentService } from "../services/appointmentService";

export const appointmentRepository = {
  async list(): Promise<Appointment[]> {
    return appointmentService.getAll();
  },

  async getById(id: string): Promise<Appointment | undefined> {
    return appointmentService.getById(id);
  },

  async listByPatient(patientId: string): Promise<Appointment[]> {
    return appointmentService.getByPatient(patientId);
  },

  async listByDate(date: string): Promise<Appointment[]> {
    return appointmentService.getByDate(date);
  },

  async create(appointment: Appointment): Promise<boolean> {
    return appointmentService.createAppointment(appointment);
  },

  async update(id: string, changes: Partial<Appointment>): Promise<boolean> {
    return appointmentService.updateAppointment(id, changes);
  },

  async updateStatus(id: string, status: AppointmentStatus): Promise<boolean> {
    return appointmentService.updateStatus(id, status);
  },

  async softDelete(id: string): Promise<boolean> {
    return appointmentService.deleteAppointment(id);
  },
};

