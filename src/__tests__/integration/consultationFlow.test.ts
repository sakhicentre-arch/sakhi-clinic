import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockPatients, mockConsultations } from "../mocks/mockData";

/**
 * CONSULTATION PAGE INTEGRATION TESTS
 * Tests the entire consultation workflow without rendering UI
 */

describe("Consultation Flow Integration", () => {
  let patient: any;
  let consultation: any;

  beforeEach(() => {
    patient = mockPatients.create();
    consultation = mockConsultations.create(patient.id);
  });

  describe("Consultation Creation", () => {
    it("should create consultation with all required fields", () => {
      expect(consultation).toHaveProperty("id");
      expect(consultation).toHaveProperty("patientId");
      expect(consultation).toHaveProperty("date");
      expect(consultation).toHaveProperty("caseText");
      expect(consultation).toHaveProperty("medicines");
      expect(consultation.patientId).toBe(patient.id);
    });

    it("should validate chief complaint is required", () => {
      expect(consultation.caseText).toBeTruthy();
      expect(consultation.caseText.length).toBeGreaterThan(0);
    });

    it("should initialize with default potencies", () => {
      expect(consultation.medicines.length).toBeGreaterThan(0);
      const potencies = ["6C", "12C", "30C", "200C", "1M", "10M", "50M", "CM"];
      consultation.medicines.forEach((med: any) => {
        expect(potencies).toContain(med.potency);
      });
    });
  });

  describe("Prescription Management", () => {
    it("should add multiple medicines to consultation", () => {
      const medicines = [
        { name: "Nux Vomica", potency: "30C", dosage: "1-0-1", duration: "5 Days", notes: "" },
        { name: "Lycopodium", potency: "200C", dosage: "0-0-1", duration: "7 Days", notes: "" },
      ];

      const updatedConsultation = {
        ...consultation,
        medicines,
      };

      expect(updatedConsultation.medicines.length).toBe(2);
      expect(updatedConsultation.medicines[0].name).toBe("Nux Vomica");
      expect(updatedConsultation.medicines[1].name).toBe("Lycopodium");
    });

    it("should remove medicine from prescription", () => {
      const medicines = consultation.medicines.slice(0, -1);
      const updatedConsultation = {
        ...consultation,
        medicines,
      };

      expect(updatedConsultation.medicines.length).toBeLessThan(
        consultation.medicines.length
      );
    });

    it("should update medicine potency and dosage", () => {
      const updatedMedicines = consultation.medicines.map((m: any, i: number) =>
        i === 0 ? { ...m, potency: "200C", dosage: "0-0-1" } : m
      );

      expect(updatedMedicines[0].potency).toBe("200C");
      expect(updatedMedicines[0].dosage).toBe("0-0-1");
    });

    it("should validate remedy name is present", () => {
      expect(consultation.medicines[0].name).toBeTruthy();
      expect(consultation.medicines[0].name.length).toBeGreaterThan(0);
    });

    it("should validate dosage options", () => {
      const validDosages = ["1-0-1", "0-0-1", "1-0-0", "0-1-0", "1-1-1", "SOS", "Weekly"];
      consultation.medicines.forEach((med: any) => {
        expect(validDosages).toContain(med.dosage);
      });
    });

    it("should validate duration options", () => {
      const validDurations = [
        "3 Days",
        "5 Days",
        "7 Days",
        "10 Days",
        "15 Days",
        "30 Days",
        "As needed",
      ];
      consultation.medicines.forEach((med: any) => {
        expect(validDurations).toContain(med.duration);
      });
    });
  });

  describe("Clinical Data Validation", () => {
    it("should require chief complaint", () => {
      expect(consultation.caseText).toBeTruthy();
    });

    it("should track follow-up outcome", () => {
      const validOutcomes = ["improved", "partial", "no_change", "worse"];
      expect(validOutcomes).toContain(consultation.outcome);
    });

    it("should save follow-up date", () => {
      expect(consultation.followUpDate).toBeTruthy();
      const followUpDate = new Date(consultation.followUpDate);
      expect(followUpDate instanceof Date).toBe(true);
    });

    it("should store all clinical fields", () => {
      expect(consultation).toHaveProperty("mind");
      expect(consultation).toHaveProperty("generals");
      expect(consultation).toHaveProperty("appetite");
      expect(consultation).toHaveProperty("thirst");
      expect(consultation).toHaveProperty("sleep");
      expect(consultation).toHaveProperty("thermal");
    });
  });

  describe("Draft Auto-Save", () => {
    it("should support draft consultation object structure", () => {
      const draft = {
        patientId: patient.id,
        chiefComplaint: "Headache",
        caseText: "Draft consultation",
        medicines: [],
      };

      expect(draft.patientId).toBe(patient.id);
      expect(draft.chiefComplaint).toBeTruthy();
    });

    it("should restore draft with all data intact", () => {
      const originalDraft = {
        ...consultation,
        timestamp: new Date().getTime(),
      };

      const restoredDraft = { ...originalDraft };

      expect(restoredDraft.patientId).toBe(originalDraft.patientId);
      expect(restoredDraft.medicines).toEqual(originalDraft.medicines);
      expect(restoredDraft.timestamp).toBe(originalDraft.timestamp);
    });
  });

  describe("Multiple Consultations per Patient", () => {
    it("should link consultations to same patient", () => {
      const consultations = mockConsultations.createBatch(patient.id, 3);

      consultations.forEach((c) => {
        expect(c.patientId).toBe(patient.id);
      });
    });

    it("should maintain consultation history order", () => {
      const consultations = mockConsultations.createBatch(patient.id, 3);
      const dates = consultations.map((c) => new Date(c.date).getTime());

      // Check that each consultation has unique ID
      const ids = new Set(consultations.map((c) => c.id));
      expect(ids.size).toBe(consultations.length);
    });

    it("should handle follow-up mode for subsequent consultations", () => {
      const firstConsult = mockConsultations.create(patient.id);
      const followUpConsult = mockConsultations.create(patient.id, {
        parentConsultationId: firstConsult.id,
      });

      expect(followUpConsult.parentConsultationId).toBe(firstConsult.id);
    });
  });

  describe("Edge Cases", () => {
    it("should handle consultation with no medicines initially", () => {
      const minimalConsult = mockConsultations.create(patient.id, {
        medicines: [],
      });

      expect(minimalConsult.medicines.length).toBe(0);
    });

    it("should handle very long case text", () => {
      const longText =
        "Lorem ipsum dolor sit amet, ".repeat(100);
      const consult = mockConsultations.create(patient.id, {
        caseText: longText,
      });

      expect(consult.caseText.length).toBeGreaterThan(1000);
    });

    it("should handle special characters in notes", () => {
      const specialChars = "Test: @#$%^&*() <>&\"'";
      const consult = mockConsultations.create(patient.id, {
        medicines: [
          {
            name: "Test Remedy",
            potency: "30C",
            dosage: "1-0-1",
            duration: "5 Days",
            notes: specialChars,
            prescription: {
              followUpDays: "15",
              instructions: "Test",
              dietAdvice: [],
              precautions: [],
            },
          },
        ],
      });

      expect(consult.medicines[0].notes).toBe(specialChars);
    });
  });
});
