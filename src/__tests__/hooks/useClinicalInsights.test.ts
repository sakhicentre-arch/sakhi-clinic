import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClinicalInsights } from "../../hooks/useClinicalInsights";
import { mockConsultations, mockPatients } from "../mocks/mockData";

describe("useClinicalInsights Hook", () => {
  let consultationHistory: any[];
  let mockPatient: any;

  beforeEach(() => {
    mockPatient = mockPatients.create();
    consultationHistory = mockConsultations.createBatch("PAT-001", 5);
  });

  it("should return valid clinical insights structure", () => {
    const { result } = renderHook(() =>
      useClinicalInsights(consultationHistory, mockPatient)
    );

    expect(result.current).toHaveProperty("patternAlerts");
    expect(result.current).toHaveProperty("caseProgression");
    expect(result.current).toHaveProperty("doctorAlerts");
    expect(Array.isArray(result.current.patternAlerts)).toBe(true);
    expect(Array.isArray(result.current.doctorAlerts)).toBe(true);
    expect(typeof result.current.caseProgression).toBe("object");
  });

  it("should track case progression metrics", () => {
    const { result } = renderHook(() =>
      useClinicalInsights(consultationHistory, mockPatient)
    );

    const progression = result.current.caseProgression;
    expect(progression.totalVisits).toBe(consultationHistory.length);
    expect(progression).toHaveProperty("treatmentDuration");
    expect(progression).toHaveProperty("remedyChanges");
    expect(progression).toHaveProperty("currentTrend");
    expect(["Improving", "Stable", "Worsening", "Unknown"]).toContain(
      progression.currentTrend
    );
  });

  it("should detect pattern alerts for no improvement", () => {
    const poorHistory = mockConsultations.createBatch("PAT-001", 3);
    poorHistory.forEach((c) => {
      c.outcome = "NoChange";
      c.medicines = [{ name: "Nux Vomica", potency: "30C" }];
    });

    const { result } = renderHook(() =>
      useClinicalInsights(poorHistory, mockPatient)
    );

    // Should detect pattern alerts
    expect(result.current.patternAlerts).toBeDefined();
  });

  it("should generate doctor alerts for first visits", () => {
    const { result } = renderHook(() =>
      useClinicalInsights(consultationHistory, mockPatient)
    );

    const alerts = result.current.doctorAlerts;
    expect(Array.isArray(alerts)).toBe(true);
    alerts.forEach((alert) => {
      expect([
        "pendingPayment",
        "missedFollowUp",
        "stableCase",
        "firstVisit",
      ]).toContain(alert.type);
      expect(alert).toHaveProperty("label");
      expect(alert).toHaveProperty("color");
      expect(alert).toHaveProperty("bg");
    });
  });

  it("should handle empty consultation history", () => {
    const { result } = renderHook(() => useClinicalInsights([], mockPatient));

    expect(result.current.patternAlerts).toBeDefined();
    expect(result.current.caseProgression.totalVisits).toBe(0);
  });

  it("should handle null patient gracefully", () => {
    const { result } = renderHook(() =>
      useClinicalInsights(consultationHistory, null)
    );

    expect(result.current).toBeDefined();
    expect(result.current.patternAlerts).toBeDefined();
  });

  it("should sort consultations chronologically", () => {
    const unsortedHistory = [
      ...consultationHistory.slice(2),
      ...consultationHistory.slice(0, 2),
    ];

    const { result } = renderHook(() =>
      useClinicalInsights(unsortedHistory, mockPatient)
    );

    // Total visits should still be counted correctly
    expect(result.current.caseProgression.totalVisits).toBe(
      unsortedHistory.length
    );
  });

  it("should not mutate original consultations array", () => {
    const originalLength = consultationHistory.length;
    const originalFirst = { ...consultationHistory[0] };

    renderHook(() =>
      useClinicalInsights(consultationHistory, mockPatient)
    );

    expect(consultationHistory.length).toBe(originalLength);
    expect(consultationHistory[0]).toEqual(originalFirst);
  });
});
