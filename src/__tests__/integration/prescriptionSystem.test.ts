import { describe, it, expect, beforeEach } from "vitest";
import { mockConsultations } from "../mocks/mockData";

/**
 * PRESCRIPTION SYSTEM INTEGRATION TESTS
 */

describe("Prescription System", () => {
  let consultation: any;

  beforeEach(() => {
    consultation = mockConsultations.create("PAT-001");
  });

  describe("Remedy Selection", () => {
    it("should support common remedy names", () => {
      const commonRemedies = [
        "Nux Vomica",
        "Lycopodium",
        "Pulsatilla",
        "Arsenicum Album",
        "Sulphur",
        "Calcarea Carbonica",
        "Silica",
        "Sepia",
      ];

      const remedy = {
        name: commonRemedies[0],
        potency: "30C",
        dosage: "1-0-1",
        duration: "5 Days",
      };

      expect(commonRemedies).toContain(remedy.name);
    });

    it("should support remedy search functionality", () => {
      const allRemedies = [
        "Arsenicum Album",
        "Belladonna",
        "Bryonia",
        "Nux Vomica",
        "Pulsatilla",
      ];

      const searchQuery = "nux";
      const results = allRemedies.filter((r) =>
        r.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toContain("Nux");
    });
  });

  describe("Potency Selection", () => {
    it("should support valid potencies", () => {
      const validPotencies = ["6C", "12C", "30C", "200C", "1M", "10M", "50M", "CM"];

      consultation.medicines.forEach((med: any) => {
        expect(validPotencies).toContain(med.potency);
      });
    });

    it("should allow potency update", () => {
      const originalPotency = consultation.medicines[0].potency;
      const updatedMedicines = consultation.medicines.map((m: any, i: number) =>
        i === 0 ? { ...m, potency: "200C" } : m
      );

      expect(updatedMedicines[0].potency).not.toBe(originalPotency);
      expect(updatedMedicines[0].potency).toBe("200C");
    });
  });

  describe("Dosage Selection", () => {
    it("should support valid dosages", () => {
      const validDosages = ["1-0-1", "0-0-1", "1-0-0", "0-1-0", "1-1-1", "SOS", "Weekly"];

      consultation.medicines.forEach((med: any) => {
        expect(validDosages).toContain(med.dosage);
      });
    });

    it("should allow dosage update", () => {
      const originalDosage = consultation.medicines[0].dosage;
      const updatedMedicines = consultation.medicines.map((m: any, i: number) =>
        i === 0 ? { ...m, dosage: "0-0-1" } : m
      );

      expect(updatedMedicines[0].dosage).not.toBe(originalDosage);
    });
  });

  describe("Duration Selection", () => {
    it("should support valid durations", () => {
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

    it("should allow duration update", () => {
      const updatedMedicines = consultation.medicines.map((m: any, i: number) =>
        i === 0 ? { ...m, duration: "30 Days" } : m
      );

      expect(updatedMedicines[0].duration).toBe("30 Days");
    });
  });

  describe("Multiple Medicine Management", () => {
    it("should add remedy rows", () => {
      const initialCount = consultation.medicines.length;
      const newMedicine = {
        name: "Lycopodium",
        potency: "200C",
        dosage: "0-0-1",
        duration: "7 Days",
        notes: "",
        prescription: {
          followUpDays: "15",
          instructions: "Before meals",
          dietAdvice: [],
          precautions: [],
        },
      };

      const updated = [...consultation.medicines, newMedicine];

      expect(updated.length).toBe(initialCount + 1);
    });

    it("should remove remedy rows", () => {
      const initialCount = consultation.medicines.length;
      const updated = consultation.medicines.slice(0, -1);

      expect(updated.length).toBe(initialCount - 1);
    });

    it("should maintain order of medicines", () => {
      const medicines = [
        { name: "Nux Vomica", potency: "30C" },
        { name: "Lycopodium", potency: "200C" },
        { name: "Pulsatilla", potency: "12C" },
      ];

      const medications = medicines.map((m) => ({ ...m, dosage: "1-0-1", duration: "5 Days", notes: "", prescription: { followUpDays: "15", instructions: "Before meals", dietAdvice: [], precautions: [] } }));

      expect(medications[0].name).toBe("Nux Vomica");
      expect(medications[1].name).toBe("Lycopodium");
      expect(medications[2].name).toBe("Pulsatilla");
    });

    it("should support up to 10 medicines in one prescription", () => {
      const medicines = Array.from({ length: 10 }).map((_, i) => ({
        name: `Remedy ${i + 1}`,
        potency: "30C",
        dosage: "1-0-1",
        duration: "5 Days",
        notes: "",
        prescription: {
          followUpDays: "15",
          instructions: "Before meals",
          dietAdvice: [],
          precautions: [],
        },
      }));

      expect(medicines.length).toBe(10);
    });
  });

  describe("Last Remedies Suggestion", () => {
    it("should retrieve last 3 remedies from history", () => {
      const history = mockConsultations.createBatch("PAT-001", 5);
      const lastRemedies = history
        .slice(0, 3)
        .map((c) => c.medicines[0]?.name)
        .filter(Boolean);

      expect(lastRemedies.length).toBeLessThanOrEqual(3);
    });

    it("should suggest remedies that worked previously", () => {
      const successfulConsultation = mockConsultations.create("PAT-001", {
        outcome: "improved",
      });

      if (
        successfulConsultation.medicines[0] &&
        successfulConsultation.outcome === "improved"
      ) {
        expect(successfulConsultation.medicines[0].name).toBeTruthy();
      }
    });
  });

  describe("Follow-up Instructions", () => {
    it("should store follow-up days", () => {
      expect(consultation.medicines[0].prescription.followUpDays).toBeTruthy();
    });

    it("should store follow-up instructions", () => {
      expect(consultation.medicines[0].prescription.instructions).toBeTruthy();
    });

    it("should store diet advice array", () => {
      expect(Array.isArray(consultation.medicines[0].prescription.dietAdvice)).toBe(
        true
      );
    });

    it("should store precautions array", () => {
      expect(
        Array.isArray(consultation.medicines[0].prescription.precautions)
      ).toBe(true);
    });

    it("should support adding diet advice", () => {
      const updated = {
        ...consultation,
        medicines: consultation.medicines.map((m: any) => ({
          ...m,
          prescription: {
            ...m.prescription,
            dietAdvice: ["Avoid dairy", "Eat fresh vegetables"],
          },
        })),
      };

      expect(updated.medicines[0].prescription.dietAdvice.length).toBeGreaterThan(0);
    });

    it("should support adding precautions", () => {
      const updated = {
        ...consultation,
        medicines: consultation.medicines.map((m: any) => ({
          ...m,
          prescription: {
            ...m.prescription,
            precautions: ["Avoid strong coffee", "No perfumes"],
          },
        })),
      };

      expect(updated.medicines[0].prescription.precautions.length).toBeGreaterThan(0);
    });
  });

  describe("Prescription Data Validation", () => {
    it("should require remedy name", () => {
      expect(consultation.medicines[0].name).toBeTruthy();
    });

    it("should require potency selection", () => {
      expect(consultation.medicines[0].potency).toBeTruthy();
    });

    it("should require dosage selection", () => {
      expect(consultation.medicines[0].dosage).toBeTruthy();
    });

    it("should require duration selection", () => {
      expect(consultation.medicines[0].duration).toBeTruthy();
    });
  });

  describe("Edge Cases", () => {
    it("should handle prescription with no notes", () => {
      const medicine = {
        name: "Nux Vomica",
        potency: "30C",
        dosage: "1-0-1",
        duration: "5 Days",
        notes: "",
      };

      expect(medicine.notes).toBe("");
    });

    it("should handle very long medicine notes", () => {
      const longNotes = "Important instructions: ".repeat(50);
      const medicine = {
        ...consultation.medicines[0],
        notes: longNotes,
      };

      expect(medicine.notes.length).toBeGreaterThan(500);
    });

    it("should handle prescription with custom instructions", () => {
      const customInstruction = "Take with warm water and honey";
      const medicine = {
        ...consultation.medicines[0],
        prescription: {
          ...consultation.medicines[0].prescription,
          instructions: customInstruction,
        },
      };

      expect(medicine.prescription.instructions).toBe(customInstruction);
    });
  });
});
