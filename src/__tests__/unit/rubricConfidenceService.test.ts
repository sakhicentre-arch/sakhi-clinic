import { describe, expect, it } from "vitest";
import {
  scoreFieldMappedConfidence,
  scoreKeywordMatchConfidence,
  confidenceLabel,
} from "../../services/rubricConfidenceService";

describe("rubricConfidenceService.scoreFieldMappedConfidence", () => {
  it("gives the high baseline for a normal-length phrase", () => {
    expect(scoreFieldMappedConfidence("forsaken feeling")).toBe(0.85);
  });

  it("gives a reduced score for a very short, likely-noisy phrase", () => {
    expect(scoreFieldMappedConfidence("hot")).toBe(0.6);
  });
});

describe("rubricConfidenceService.scoreKeywordMatchConfidence", () => {
  it("gives the baseline for a single keyword hit", () => {
    expect(scoreKeywordMatchConfidence(1)).toBe(0.45);
  });

  it("adds a cluster bonus for multiple distinct keyword hits", () => {
    expect(scoreKeywordMatchConfidence(3)).toBeCloseTo(0.45 + 2 * 0.08, 5);
  });

  it("caps at the maximum regardless of how many hits", () => {
    expect(scoreKeywordMatchConfidence(20)).toBe(0.75);
  });
});

describe("rubricConfidenceService.confidenceLabel", () => {
  it("labels >= 0.75 as Strong", () => {
    expect(confidenceLabel(0.85)).toBe("Strong");
    expect(confidenceLabel(0.75)).toBe("Strong");
  });

  it("labels 0.5-0.74 as Moderate", () => {
    expect(confidenceLabel(0.6)).toBe("Moderate");
    expect(confidenceLabel(0.5)).toBe("Moderate");
  });

  it("labels below 0.5 as Weak", () => {
    expect(confidenceLabel(0.3)).toBe("Weak");
  });
});
