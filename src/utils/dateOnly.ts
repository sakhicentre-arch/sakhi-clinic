/**
 * dateOnly.ts
 * Sakhi Clinic — shared date-only helpers.
 *
 * Extracted from followUpIntelligenceService.ts (Phase 1), which
 * documented a real bug here: bare "YYYY-MM-DD" strings (as persisted by
 * patientService.ts/consultationService.ts for nextFollowUpDate/
 * followUpDate/consultation.date) parse as UTC midnight per the
 * ECMAScript Date Time String Format when passed straight to `new
 * Date(...)`. Combined with a local .setHours(0,0,0,0), that can land on
 * the PREVIOUS local calendar day in any timezone behind UTC (and
 * causes analogous drift in timezones ahead of UTC too). Any code
 * bucketing/comparing these bare-date strings by local calendar day
 * must go through parseDateOnly, not `new Date(dateOnly)` directly.
 *
 * Single source of truth for this parsing rule -- do not reintroduce a
 * second copy of it elsewhere (paymentService.ts and
 * followUpIntelligenceService.ts both import from here).
 *
 * Doctor-reported incident (2026-08-08): a full ISO datetime string
 * (e.g. "2026-08-09T18:30:00.000Z", produced upstream by a since-fixed
 * <input type="datetime-local"> field feeding new Date(...).toISOString())
 * reached parseDateOnly instead of the bare "YYYY-MM-DD" it expects.
 * `.split("-").map(Number)` turned the trailing "09T18:30:00.000Z" into
 * NaN, and `d || 1` silently substituted day 1 -- "10/08/2026" was
 * displayed and classified as "01/08/2026", days in the past, so a
 * genuinely future follow-up was flagged Overdue/Missed. parseDateOnly
 * now defends against this class of input directly, so any future
 * caller that accidentally passes a non-bare-date string is protected
 * without needing to know this history.
 */

export function parseDateOnly(dateOnly: string): Date {
  // A bare "YYYY-MM-DD" is exactly 10 characters; anything longer is a
  // full ISO/datetime string, which new Date(...) parses correctly on
  // its own (it carries its own explicit offset/instant) -- splitting
  // it on "-" the way a bare date is split would corrupt it instead.
  if (dateOnly.length > 10) return new Date(dateOnly);
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isoWeekStart(d: Date): string {
  const copy = startOfDay(d);
  const day = copy.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diffToMonday);
  return dateKey(copy);
}

/** True if `dateOnlyOrIso` falls in the same local calendar month+year as
 * `reference`. Accepts either a bare "YYYY-MM-DD" or a full ISO timestamp
 * (consultation.date is stored as a full ISO string, unlike
 * followUpDate/nextFollowUpDate) -- parseDateOnly handles a bare date
 * string correctly; a full ISO string is safe to hand to `new Date(...)`
 * directly since it carries its own explicit offset/instant, not just a
 * calendar date. */
export function isSameLocalMonth(dateOnlyOrIso: string, reference: Date): boolean {
  const d = dateOnlyOrIso.length <= 10 ? parseDateOnly(dateOnlyOrIso) : new Date(dateOnlyOrIso);
  return d.getFullYear() === reference.getFullYear() && d.getMonth() === reference.getMonth();
}

/** True if `dateOnlyOrIso` falls on the same local calendar day as `reference`. */
export function isSameLocalDay(dateOnlyOrIso: string, reference: Date): boolean {
  const d = dateOnlyOrIso.length <= 10 ? parseDateOnly(dateOnlyOrIso) : new Date(dateOnlyOrIso);
  return dateKey(d) === dateKey(reference);
}
