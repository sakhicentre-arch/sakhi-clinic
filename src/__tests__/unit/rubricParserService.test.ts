import { describe, expect, it } from "vitest";
import {
  splitIntoPhrases,
  splitIntoSentences,
  extractFieldMappedPhrases,
  extractFreeTextSentences,
  derivePatientContext,
} from "../../services/rubricParserService";

describe("rubricParserService.splitIntoPhrases", () => {
  it("splits on commas, semicolons, and 'and'", () => {
    expect(splitIntoPhrases("irritable, weeping and forsaken feeling; anxious")).toEqual([
      "irritable", "weeping", "forsaken feeling", "anxious",
    ]);
  });

  it("drops phrases shorter than 3 characters", () => {
    expect(splitIntoPhrases("ok, a, tired")).toEqual(["tired"]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitIntoPhrases("")).toEqual([]);
    expect(splitIntoPhrases("   ")).toEqual([]);
  });
});

describe("rubricParserService.splitIntoSentences", () => {
  it("splits on sentence terminators and newlines", () => {
    expect(splitIntoSentences("Headache worse in sun. Better from rest.\nOccasional nausea!")).toEqual([
      "Headache worse in sun", "Better from rest", "Occasional nausea",
    ]);
  });

  it("drops fragments shorter than 5 characters", () => {
    expect(splitIntoSentences("Ok. Fine now.")).toEqual(["Fine now"]);
  });
});

describe("rubricParserService.extractFieldMappedPhrases", () => {
  it("extracts phrases from every directly-mapped field", () => {
    const result = extractFieldMappedPhrases({
      mind: "irritable, weeping",
      thermal: "chilly patient",
      desire: "sweets, cold drinks",
      aversion: "fatty food",
      sleep: "disturbed sleep",
    } as any);

    expect(result).toContainEqual({ category: "mind", phrase: "irritable", fieldSource: "mind" });
    expect(result).toContainEqual({ category: "mind", phrase: "weeping", fieldSource: "mind" });
    expect(result).toContainEqual({ category: "thermals", phrase: "chilly patient", fieldSource: "thermal" });
    expect(result).toContainEqual({ category: "foodDesires", phrase: "sweets", fieldSource: "desire" });
    expect(result).toContainEqual({ category: "foodAversions", phrase: "fatty food", fieldSource: "aversion" });
    expect(result).toContainEqual({ category: "sleep", phrase: "disturbed sleep", fieldSource: "sleep" });
  });

  it("skips empty/missing fields entirely", () => {
    expect(extractFieldMappedPhrases({ mind: "", thermal: undefined } as any)).toEqual([]);
  });
});

describe("rubricParserService.extractFreeTextSentences", () => {
  it("extracts sentences from chief complaint and case text", () => {
    const result = extractFreeTextSentences({
      chiefComplaint: "Severe headache",
      caseText: "Worse from sun exposure. Better indoors.",
    } as any);

    expect(result).toContainEqual({ sentence: "Severe headache", fieldSource: "chiefComplaint" });
    expect(result).toContainEqual({ sentence: "Worse from sun exposure", fieldSource: "caseText" });
    expect(result).toContainEqual({ sentence: "Better indoors", fieldSource: "caseText" });
  });
});

describe("rubricParserService.derivePatientContext", () => {
  it("parses numeric and string ages", () => {
    expect(derivePatientContext({ age: 8, gender: "Male" })).toEqual({ ageYears: 8, isFemale: false });
    expect(derivePatientContext({ age: "45", gender: "Female" })).toEqual({ ageYears: 45, isFemale: true });
  });

  it("treats an unparseable age as null, never a guessed number", () => {
    expect(derivePatientContext({ age: "N/A", gender: "Male" }).ageYears).toBeNull();
  });

  it("handles a missing patient gracefully", () => {
    expect(derivePatientContext(null)).toEqual({ ageYears: null, isFemale: false });
  });

  it("recognizes 'Female' case-insensitively via a starts-with check", () => {
    expect(derivePatientContext({ age: 30, gender: "female" }).isFemale).toBe(true);
    expect(derivePatientContext({ age: 30, gender: "FEMALE" }).isFemale).toBe(true);
    expect(derivePatientContext({ age: 30, gender: "Male" }).isFemale).toBe(false);
  });
});
