import { describe, expect, it } from "vitest";
import { generateRubricSuggestions } from "../../services/rubricSuggestionEngine";

describe("rubricSuggestionEngine.generateRubricSuggestions", () => {
  it("generates high-confidence suggestions from field-mapped content", () => {
    const suggestions = generateRubricSuggestions({
      mind: "irritable, weeping",
      thermal: "chilly patient",
      chiefComplaint: "",
      caseText: "",
    } as any);

    const mindSuggestion = suggestions.find((s) => s.category === "mind" && s.text.toLowerCase() === "irritable");
    expect(mindSuggestion).toBeDefined();
    expect(mindSuggestion!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(mindSuggestion!.reason).toContain("Mind");
    expect(mindSuggestion!.source).toBe("ai");
  });

  it("generates lower-confidence suggestions from free-text keyword matches", () => {
    const suggestions = generateRubricSuggestions({
      chiefComplaint: "Headache worse from sun exposure",
      caseText: "",
    } as any);

    const modalitySuggestion = suggestions.find((s) => s.category === "modalities");
    expect(modalitySuggestion).toBeDefined();
    expect(modalitySuggestion!.matchedSentence).toContain("worse from sun");
    expect(modalitySuggestion!.confidence).toBeLessThan(0.85);
  });

  it("never generates remedy suggestions or repertorization output -- only category/text/evidence fields exist", () => {
    const suggestions = generateRubricSuggestions({
      chiefComplaint: "Severe joint pain, worse from cold, better from warmth",
      caseText: "Patient desires sweets and avoids fatty food",
      desire: "sweets",
      aversion: "fatty food",
    } as any);

    for (const s of suggestions) {
      expect(Object.keys(s).sort()).toEqual(
        ["category", "confidence", "evidence", "matchedSentence", "priority", "reason", "source", "text"].sort()
      );
      expect((s as any).remedy).toBeUndefined();
    }
  });

  it("gates children/oldAge/pregnancy categories on patient context", () => {
    const consultation = { chiefComplaint: "Patient reports morning sickness and clingy behavior", caseText: "" } as any;

    const noPatientContext = generateRubricSuggestions(consultation, null);
    expect(noPatientContext.some((s) => s.category === "pregnancy" || s.category === "children")).toBe(false);

    const pregnantAdult = generateRubricSuggestions(consultation, { age: 28, gender: "Female" });
    expect(pregnantAdult.some((s) => s.category === "pregnancy")).toBe(true);
  });

  it("deduplicates identical category+text combinations", () => {
    const suggestions = generateRubricSuggestions({
      chiefComplaint: "Worse from cold. Worse from cold again today.",
      caseText: "",
    } as any);
    const worseFromColdCount = suggestions.filter((s) => s.category === "modalities" && s.matchedSentence.toLowerCase().includes("worse from cold")).length;
    // Two distinct sentences both matching "worse from cold" produce two
    // distinct matchedSentence values, so this asserts no duplicate
    // (category, exact same matchedSentence) pair rather than collapsing
    // to one -- verified by checking uniqueness of the pairs themselves.
    const seen = new Set(suggestions.map((s) => `${s.category}::${s.text}`));
    expect(seen.size).toBe(suggestions.length);
    expect(worseFromColdCount).toBeGreaterThan(0);
  });

  it("assigns priority as a 1-based rank ordered by descending confidence", () => {
    const suggestions = generateRubricSuggestions({
      mind: "irritable",
      chiefComplaint: "Worse from cold",
      caseText: "",
    } as any);

    expect(suggestions[0].priority).toBe(1);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].confidence).toBeLessThanOrEqual(suggestions[i - 1].confidence);
      expect(suggestions[i].priority).toBe(i + 1);
    }
  });

  it("returns an empty array for a consultation with no matchable content", () => {
    expect(generateRubricSuggestions({ chiefComplaint: "", caseText: "" } as any)).toEqual([]);
  });
});
