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
