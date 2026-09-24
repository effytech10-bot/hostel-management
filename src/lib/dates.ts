/**
 * Date / billing-period helpers.
 *
 * - Business dates are plain "YYYY-MM-DD" strings in Asia/Dhaka.
 * - A billing period is a month, written "YYYY-MM" (e.g. "2026-10").
 * - Timestamps in the database are stored in UTC; only calendar dates are local.
 */
export const APP_TIMEZONE = "Asia/Dhaka";

export type DateString = string; // "YYYY-MM-DD"
export type Period = string; // "YYYY-MM"

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Dhaka for a given instant (default: now). */
export function dhakaDate(instant: Date = new Date()): DateString {
  return dateFormatter.format(instant); // en-CA gives YYYY-MM-DD
}

/** Billing period in Dhaka for a given instant (default: now). */
export function currentPeriod(instant: Date = new Date()): Period {
  return dhakaDate(instant).slice(0, 7);
}

export function isValidPeriod(value: string): value is Period {
  return PERIOD_RE.test(value);
}

export function isValidDate(value: string): value is DateString {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  return Number(d) <= daysInMonth(Number(y), Number(mo));
}

export function parsePeriod(period: Period): { year: number; month: number } {
  const m = PERIOD_RE.exec(period);
  if (!m) throw new Error(`Invalid period "${period}", expected YYYY-MM`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function makePeriod(year: number, month: number): Period {
  return `${year}-${pad(month)}`;
}

export function daysInPeriod(period: Period): number {
  const { year, month } = parsePeriod(period);
  return daysInMonth(year, month);
}

export function periodStart(period: Period): DateString {
  parsePeriod(period);
  return `${period}-01`;
}

export function periodEnd(period: Period): DateString {
  return `${period}-${pad(daysInPeriod(period))}`;
}

export function periodOf(date: DateString): Period {
  if (!isValidDate(date)) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return date.slice(0, 7);
}

export function addMonths(period: Period, delta: number): Period {
  const { year, month } = parsePeriod(period);
  const index = year * 12 + (month - 1) + delta;
  return makePeriod(Math.floor(index / 12), (index % 12) + 1);
}

export const nextPeriod = (period: Period) => addMonths(period, 1);
export const previousPeriod = (period: Period) => addMonths(period, -1);

/** All dates of a period, "YYYY-MM-01" .. last day. */
export function datesInPeriod(period: Period): DateString[] {
  return Array.from({ length: daysInPeriod(period) }, (_, i) => `${period}-${pad(i + 1)}`);
}

/** "2026-10" -> "October 2026" */
export function formatPeriod(period: Period): string {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-09-26" -> "26 Sep 2026" */
export function formatDate(date: DateString): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
