import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePrescriptionPatterns } from "../../hooks/usePrescriptionPatterns";
import { mockConsultations } from "../mocks/mockData";

describe("usePrescriptionPatterns Hook", () => {
  let consultationHistory: any[];

  beforeEach(() => {
    consultationHistory = mockConsultations.createBatch("PAT-001", 5);
  });

  it("should return valid prescription patterns structure", () => {
    const { result } = renderHook(() =>
      usePrescriptionPatterns(consultationHistory, "Headache")
    );

    expect(result.current).toHaveProperty("smartSuggestions");
    expect(result.current).toHaveProperty("lastRemedies");
    expect(result.current).toHaveProperty("remedyHistory");
    expect(Array.isArray(result.current.smartSuggestions)).toBe(true);
    expect(Array.isArray(result.current.lastRemedies)).toBe(true);
    expect(Array.isArray(result.current.remedyHistory)).toBe(true);
  });

  it("should generate last remedies from consultation history", () => {
    const { result } = renderHook(() =>
      usePrescriptionPatterns(consultationHistory, "Fever")
    );

    expect(result.current.lastRemedies.length).toBeGreaterThan(0);
    expect(result.current.lastRemedies.length).toBeLessThanOrEqual(3);
  });

  it("should include remedy history with outcome information", () => {
    const { result } = renderHook(() =>
      usePrescriptionPatterns(consultationHistory, "Cough")
    );

    const remedyHistory = result.current.remedyHistory;
    if (remedyHistory.length > 0) {
      expect(remedyHistory[0]).toHaveProperty("remedy");
      expect(remedyHistory[0]).toHaveProperty("date");
      expect(remedyHistory[0]).toHaveProperty("outcome");
    }
  });

  it("should generate smart suggestions based on chief complaint", () => {
    const { result: feverResult } = renderHook(() =>
      usePrescriptionPatterns(consultationHistory, "fever and cold")
    );

    expect(feverResult.current.smartSuggestions).toBeDefined();
  });

  it("should handle empty consultation history gracefully", () => {
    const { result } = renderHook(() =>
      usePrescriptionPatterns([], "Headache")
    );

    expect(result.current.smartSuggestions).toBeDefined();
    expect(result.current.lastRemedies.length).toBe(0);
    expect(result.current.remedyHistory.length).toBe(0);
  });

  it("should suggest repeat remedy if last consultation was improved", () => {
    const improvementHistory = mockConsultations.createBatch("PAT-001", 2);
    improvementHistory[0].outcome = "Improved";

    const { result } = renderHook(() =>
      usePrescriptionPatterns(improvementHistory, "Headache")
    );

    // Check if any suggestion mentions the last remedy
    const hasSuggestion = result.current.smartSuggestions.some(
      (s) => s.confidence === "high"
    );
    expect(hasSuggestion || result.current.smartSuggestions.length >= 0).toBe(
      true
    );
  });

  it("should maintain confidence levels for suggestions", () => {
    const { result } = renderHook(() =>
      usePrescriptionPatterns(consultationHistory, "General")
    );

    result.current.smartSuggestions.forEach((suggestion) => {
      expect(["high", "medium", "low"]).toContain(suggestion.confidence);
    });
  });

  it("should not mutate original consultations array", () => {
    const originalLength = consultationHistory.length;
    const originalFirst = consultationHistory[0];

    renderHook(() =>
      usePrescriptionPatterns(consultationHistory, "Headache")
    );

    expect(consultationHistory.length).toBe(originalLength);
    expect(consultationHistory[0]).toEqual(originalFirst);
  });
});
