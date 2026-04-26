import { Patient, Consultation, Appointment } from "../services/db";

/**
 * MOCK DATA FACTORIES
 * Generates realistic test data for all major entities
 */

export const mockPatients = {
  create: (overrides?: Partial<Patient>): Patient => ({
    id: "PAT-" + Math.random().toString(36).substr(2, 9),
    name: "John Doe",
    gender: "Male",
    phone: "9876543210",
    age: 35,
    address: "123 Main Street",
    occupation: "Software Engineer",
    notes: "Chronic headaches",
    registeredDate: new Date().toISOString(),
    ...overrides,
  }),

  createBatch: (count: number): Patient[] => {
    const names = ["Alice", "Bob", "Charlie", "Diana", "Eva"];
    return Array.from({ length: count }).map((_, i) =>
      mockPatients.create({
        id: `PAT-${String(i + 1).padStart(3, "0")}`,
        name: names[i % names.length] + " " + String(i + 1),
        phone: `98765432${String(i).padStart(2, "0")}`,
      })
    );
  },
};

export const mockConsultations = {
  create: (
    patientId: string,
    overrides?: Partial<Consultation>
  ): Consultation => ({
    id: "CONS-" + Math.random().toString(36).substr(2, 9),
    patientId,
    date: new Date().toISOString(),
    caseText: "Patient presents with chronic migraines and anxiety.",
    mind: "Anxious, irritable",
    generals: "Fatigue, poor digestion",
    appetite: "Reduced",
    thirst: "Moderate",
    sleep: "Disturbed",
    thermal: "Cold",
    medicines: [
      {
        name: "Nux Vomica",
        potency: "30C",
        dosage: "1-0-1",
        duration: "5 Days",
        notes: "For stress and digestion",
        prescription: {
          followUpDays: "15",
          instructions: "Before meals",
          dietAdvice: [],
          precautions: [],
        },
      },
    ],
    followUpDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    outcome: "improved",
    ...overrides,
  }),

  createBatch: (patientId: string, count: number): Consultation[] => {
    const outcomes = [
      "improved",
      "partial",
      "no_change",
      "worse",
    ];
    const remedies = [
      "Nux Vomica",
      "Lycopodium",
      "Pulsatilla",
      "Arsenicum Album",
      "Sulphur",
    ];

    return Array.from({ length: count }).map((_, i) =>
      mockConsultations.create(patientId, {
        id: `CONS-${String(i + 1).padStart(3, "0")}`,
        date: new Date(Date.now() - i * 15 * 24 * 60 * 60 * 1000).toISOString(),
        medicines: [
          {
            name: remedies[i % remedies.length],
            potency: ["6C", "12C", "30C"][i % 3],
            dosage: ["1-0-1", "0-0-1", "1-0-0"][i % 3],
            duration: ["3 Days", "5 Days", "7 Days"][i % 3],
            notes: `Consultation ${i + 1}`,
            prescription: {
              followUpDays: "15",
              instructions: "Before meals",
              dietAdvice: [],
              precautions: [],
            },
          },
        ],
        outcome: outcomes[i % outcomes.length],
      })
    );
  },
};

export const mockAppointments = {
  create: (
    patientId: string,
    patientName: string,
    overrides?: Partial<Appointment>
  ): Appointment => ({
    id: "APT-" + Math.random().toString(36).substr(2, 9),
    patientId,
    patientName,
    clinic: "Dabholi",
    date: new Date().toISOString().split("T")[0],
    time: "14:00",
    type: "scheduled",
    status: "booked",
    ...overrides,
  }),

  createBatch: (patientId: string, patientName: string, count: number): Appointment[] => {
    return Array.from({ length: count }).map((_, i) =>
      mockAppointments.create(patientId, patientName, {
        id: `APT-${String(i + 1).padStart(3, "0")}`,
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        time: `${String(10 + (i % 8)).padStart(2, "0")}:${String(
          (i % 4) * 15
        ).padStart(2, "0")}`,
      })
    );
  },
};

export const mockDraftConsultation = {
  create: (patientId: string, overrides?: any): any => ({
    patientId,
    chiefComplaint: "Persistent headaches",
    caseText: "Patient complains of",
    mind: "",
    generals: "",
    medicines: [],
    followUpDate: new Date().toISOString(),
    ...overrides,
  }),
};

/**
 * Test Data Summary
 */
export const TEST_DATA = {
  patient: mockPatients.create(),
  consultation: mockConsultations.create("PAT-001"),
  appointment: mockAppointments.create("PAT-001", "John Doe"),
};
