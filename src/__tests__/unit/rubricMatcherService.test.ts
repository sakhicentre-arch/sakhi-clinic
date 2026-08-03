import { describe, expect, it } from "vitest";
import {
  matchKeywordsInSentence,
  matchDemographicGatedKeywords,
  matchMensesKeywords,
} from "../../services/rubricMatcherService";

describe("rubricMatcherService.matchKeywordsInSentence", () => {
  it("matches a modalities keyword", () => {
    const matches = matchKeywordsInSentence({ sentence: "Headache worse from sun exposure", fieldSource: "caseText" });
    expect(matches.some((m) => m.category === "modalities" && m.keyword === "worse from")).toBe(true);
  });

  it("matches multiple categories from one sentence", () => {
    const matches = matchKeywordsInSentence({ sentence: "Burning pain, worse from touch, after fright", fieldSource: "caseText" });
    const categories = matches.map((m) => m.category);
    expect(categories).toContain("sensations"); // "burning"
    expect(categories).toContain("modalities"); // "worse from"
    expect(categories).toContain("etiology"); // "after fright"
  });

  it("returns no matches for text with no known keywords", () => {
    expect(matchKeywordsInSentence({ sentence: "Patient feels generally okay today", fieldSource: "caseText" })).toEqual([]);
  });

  it("never matches demographic-gated categories (children/oldAge/pregnancy)", () => {
    const matches = matchKeywordsInSentence({ sentence: "Patient is pregnant and has morning sickness", fieldSource: "caseText" });
    expect(matches.some((m) => m.category === "pregnancy")).toBe(false);
  });

  it("is case-insensitive", () => {
    const matches = matchKeywordsInSentence({ sentence: "WORSE FROM COLD", fieldSource: "caseText" });
    expect(matches.some((m) => m.category === "modalities")).toBe(true);
  });
});

describe("rubricMatcherService.matchDemographicGatedKeywords", () => {
  it("matches children keywords only when the patient is age-plausible", () => {
    const sentence = { sentence: "Patient is very clingy and cries constantly", fieldSource: "caseText" };
    const childMatches = matchDemographicGatedKeywords(sentence, { ageYears: 6, isFemale: false });
    expect(childMatches.some((m) => m.category === "children")).toBe(true);

    const adultMatches = matchDemographicGatedKeywords(sentence, { ageYears: 40, isFemale: false });
    expect(adultMatches.some((m) => m.category === "children")).toBe(false);
  });

  it("matches oldAge keywords only when the patient is age-plausible", () => {
    const sentence = { sentence: "Notable memory loss over the past year", fieldSource: "caseText" };
    expect(matchDemographicGatedKeywords(sentence, { ageYears: 72, isFemale: false }).some((m) => m.category === "oldAge")).toBe(true);
    expect(matchDemographicGatedKeywords(sentence, { ageYears: 25, isFemale: false }).some((m) => m.category === "oldAge")).toBe(false);
  });

  it("matches pregnancy keywords only for a female patient", () => {
    const sentence = { sentence: "Patient reports morning sickness", fieldSource: "caseText" };
    expect(matchDemographicGatedKeywords(sentence, { ageYears: 28, isFemale: true }).some((m) => m.category === "pregnancy")).toBe(true);
    expect(matchDemographicGatedKeywords(sentence, { ageYears: 28, isFemale: false }).some((m) => m.category === "pregnancy")).toBe(false);
  });

  it("skips age-gated categories entirely when age is unknown (null), never guesses", () => {
    const sentence = { sentence: "Cries constantly and clingy", fieldSource: "caseText" };
    expect(matchDemographicGatedKeywords(sentence, { ageYears: null, isFemale: false })).toEqual([]);
  });
});

describe("rubricMatcherService.matchMensesKeywords", () => {
  it("matches menses keywords for a female patient", () => {
    const sentence = { sentence: "Irregular menses with clots", fieldSource: "caseText" };
    expect(matchMensesKeywords(sentence, { ageYears: 30, isFemale: true }).length).toBeGreaterThan(0);
  });

  it("does not match for a male patient", () => {
    const sentence = { sentence: "Irregular menses with clots", fieldSource: "caseText" };
    expect(matchMensesKeywords(sentence, { ageYears: 30, isFemale: false })).toEqual([]);
  });
});
