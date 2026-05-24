import { describe, expect, it } from "vitest";
import { parseCsv } from "../../services/patientImportService";

describe("patient CSV parsing", () => {
  it("parses simple CSV with headers and rows", () => {
    const rows = parseCsv("fullName,phone\nA,9999999999\nB,8888888888\n");
    expect(rows.length).toBe(3);
    expect(rows[0][0]).toBe("fullName");
    expect(rows[1][0]).toBe("A");
  });

  it("handles quoted commas and escaped quotes", () => {
    const rows = parseCsv('fullName,address\n"A, B","Street ""X"", City"\n');
    expect(rows[1][0]).toBe("A, B");
    expect(rows[1][1]).toBe('Street "X", City');
  });
});

