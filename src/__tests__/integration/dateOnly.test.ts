import { describe, expect, it } from "vitest";
import { parseDateOnly, startOfDay, daysBetween, dateKey, monthKey, isoWeekStart, isSameLocalDay, isSameLocalMonth } from "../../utils/dateOnly";

/**
 * Extracted from followUpIntelligenceService.ts, now the single source of
 * truth for local-calendar-date parsing (see the file's own header
 * comment for the UTC-parse bug this exists to prevent). Direct coverage
 * here since paymentService.ts now depends on it too.
 */
describe("dateOnly", () => {
  it("parseDateOnly builds a LOCAL midnight Date, not a UTC one", () => {
    const d = parseDateOnly("2026-03-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // 0-indexed
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  describe("parseDateOnly defends against a non-bare-date (full ISO) input", () => {
    // Doctor-reported incident (2026-08-08): a full ISO datetime string
    // reached parseDateOnly instead of the bare "YYYY-MM-DD" it expects.
    // Before the fix, `"2026-08-09T18:30:00.000Z".split("-").map(Number)`
    // produced day = NaN, and `d || 1` silently substituted day 1 --
    // "10/08/2026" was classified and displayed as "01/08/2026".
    it("no longer collapses a full ISO datetime string to the 1st of the month", () => {
      const d = parseDateOnly("2026-08-09T18:30:00.000Z");
      expect(d.getDate()).not.toBe(1);
    });

    it("parses a full ISO datetime string as the explicit instant it encodes", () => {
      // This exact string is what new Date("2026-08-10T00:00").toISOString()
      // produces for a doctor in IST (UTC+5:30) picking 10 Aug via a
      // datetime-local input with no explicit time -- it decodes back to
      // 10 Aug 00:00 local for that same timezone.
      const d = parseDateOnly("2026-08-09T18:30:00.000Z");
      const expected = new Date("2026-08-09T18:30:00.000Z");
      expect(d.getTime()).toBe(expected.getTime());
    });

    it("still parses a bare YYYY-MM-DD string exactly as before (no regression)", () => {
      const d = parseDateOnly("2026-08-10");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(10);
    });
  });

  it("dateKey round-trips through parseDateOnly", () => {
    expect(dateKey(parseDateOnly("2026-03-15"))).toBe("2026-03-15");
    expect(dateKey(parseDateOnly("2026-01-05"))).toBe("2026-01-05");
  });

  it("startOfDay zeroes the time without mutating the input", () => {
    const original = new Date(2026, 2, 15, 14, 30, 45);
    const copy = startOfDay(original);
    expect(copy.getHours()).toBe(0);
    expect(original.getHours()).toBe(14); // unmodified
  });

  it("daysBetween counts whole days, rounding away sub-day drift", () => {
    const a = new Date(2026, 2, 1);
    const b = new Date(2026, 2, 5);
    expect(daysBetween(a, b)).toBe(4);
    expect(daysBetween(b, a)).toBe(-4);
  });

  it("monthKey formats as YYYY-MM", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 1))).toBe("2026-12");
  });

  it("isoWeekStart finds the Monday of the given date's week", () => {
    // 2026-03-15 is a Sunday.
    expect(isoWeekStart(new Date(2026, 2, 15))).toBe("2026-03-09");
    // 2026-03-16 is the following Monday.
    expect(isoWeekStart(new Date(2026, 2, 16))).toBe("2026-03-16");
  });

  describe("isSameLocalDay / isSameLocalMonth", () => {
    const ref = new Date(2026, 2, 15, 9, 0, 0);

    it("accepts a bare YYYY-MM-DD date-only string", () => {
      expect(isSameLocalDay("2026-03-15", ref)).toBe(true);
      expect(isSameLocalDay("2026-03-14", ref)).toBe(false);
      expect(isSameLocalMonth("2026-03-01", ref)).toBe(true);
      expect(isSameLocalMonth("2026-02-28", ref)).toBe(false);
    });

    it("accepts a full ISO timestamp, parsed as an explicit instant", () => {
      const isoToday = new Date(2026, 2, 15, 22, 0, 0).toISOString();
      expect(isSameLocalDay(isoToday, ref)).toBe(true);
    });
  });
});
