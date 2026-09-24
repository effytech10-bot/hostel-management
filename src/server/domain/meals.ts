/**
 * Meal counting rules. Pure functions: no database, easy to test.
 *
 * - Every meal is ON by default for every day a student has a seat, unless the student changed their
 *   normal setting (e.g. breakfast off every day from a date). Day-by-day exceptions win over that setting.
 * - A seat interval covers [start, end): the end date belongs to the NEXT seat
 *   (a seat change on the 15th means the new seat's meals start on the 15th).
 * - A meal is not counted when the student turned it OFF, or it is a holiday
 *   (for all buildings, or for the building the student was in that day).
 * - Breakfast counts as half a meal; lunch and dinner count as one.
 *   To avoid decimals, totals are kept in "half units" (lunch = 2, breakfast = 1).
 */
import { addMonths, datesInPeriod, periodOf, periodStart, type DateString, type Period } from "@/lib/dates";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const HALF_UNITS: Record<MealSlot, number> = { breakfast: 1, lunch: 2, dinner: 2 };

export type SeatInterval = { start: DateString; end: DateString | null; buildingId: string };

export type MealCounts = {
  breakfast: number;
  lunch: number;
  dinner: number;
  /** Days with a seat in the period. */
  days: number;
  /** breakfast × 1 + (lunch + dinner) × 2. Divide by 2 for meals. */
  halfUnits: number;
};

export const mealKey = (date: DateString, slot: MealSlot) => `${date}|${slot}`;

/** Building the student lived in on `date`, or null if they had no seat that day. */
export function buildingOnDate(intervals: readonly SeatInterval[], date: DateString): string | null {
  for (const i of intervals) {
    if (i.start <= date && (i.end === null || date < i.end)) return i.buildingId;
  }
  return null;
}

/** A student's normal setting for one meal from a date onwards ("no breakfast every day from 26 Sep"). */
export type MealDefault = { slot: MealSlot; fromDate: DateString; isOn: boolean };

/** Is this meal normally ON for the student on `date`? The latest setting on or before the date wins; none = ON. */
export function defaultOn(defaults: readonly MealDefault[] | undefined, slot: MealSlot, date: DateString): boolean {
  let best: MealDefault | null = null;
  for (const d of defaults ?? []) {
    if (d.slot === slot && d.fromDate <= date && (!best || d.fromDate > best.fromDate)) best = d;
  }
  return best ? best.isOn : true;
}

/**
 * Whether one meal is eaten: a holiday is always off; a day-by-day exception (OFF or ON) wins over
 * the student's normal setting; otherwise the normal setting.
 */
export function mealIsOn(input: { holiday: boolean; off: boolean; on: boolean; normallyOn: boolean }): boolean {
  if (input.holiday) return false;
  if (input.off) return false;
  if (input.on) return true;
  return input.normallyOn;
}

export function countMeals(input: {
  period: Period;
  intervals: readonly SeatInterval[];
  offs: ReadonlySet<string>;
  /** Day-by-day ON exceptions (on days the meal is normally off). */
  ons?: ReadonlySet<string>;
  /** The student's normal settings (e.g. breakfast off every day). */
  defaults?: readonly MealDefault[];
  holidaysAll: ReadonlySet<string>;
  holidaysByBuilding: ReadonlyMap<string, ReadonlySet<string>>;
  /** Count only up to and including this date (e.g. a student who left mid-month). */
  until?: DateString;
}): MealCounts {
  const counts: MealCounts = { breakfast: 0, lunch: 0, dinner: 0, days: 0, halfUnits: 0 };
  for (const date of datesInPeriod(input.period)) {
    if (input.until && date > input.until) break;
    const buildingId = buildingOnDate(input.intervals, date);
    if (!buildingId) continue;
    counts.days++;
    const buildingHolidays = input.holidaysByBuilding.get(buildingId);
    for (const slot of MEAL_SLOTS) {
      const key = mealKey(date, slot);
      const on = mealIsOn({
        holiday: input.holidaysAll.has(key) || !!buildingHolidays?.has(key),
        off: input.offs.has(key),
        on: !!input.ons?.has(key),
        normallyOn: defaultOn(input.defaults, slot, date),
      });
      if (!on) continue;
      counts[slot]++;
      counts.halfUnits += HALF_UNITS[slot];
    }
  }
  return counts;
}

/** 127 half units -> "63.5", 126 -> "63". */
export function formatMealUnits(halfUnits: number): string {
  return halfUnits % 2 === 0 ? String(halfUnits / 2) : (halfUnits / 2).toFixed(1);
}

/**
 * Which dates can still be changed. Until month closing exists (billing module), the rule is:
 * from the 1st of last month, up to 31 days ahead (students often say in advance they are going home).
 * Returns an error message, or null when the date is editable.
 */
export function mealDateEditError(date: DateString, today: DateString): string | null {
  const earliest = periodStart(addMonths(periodOf(today), -1));
  if (date < earliest) return `Meals before ${earliest} can no longer be changed.`;
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 31);
  if (date > latest.toISOString().slice(0, 10)) return "You can only plan meals up to 31 days ahead.";
  return null;
}

/** Add/subtract days from a YYYY-MM-DD date. */
export function shiftDate(date: DateString, days: number): DateString {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Students changing their own meals
// ---------------------------------------------------------------------------

/** Hours the admin can pick as the students' deadline (the night before the meal). */
export const MEAL_CUTOFF_HOURS = [18, 19, 20, 21, 22, 23] as const;

/** Bangladesh has no daylight saving: hostel time is always UTC+6. */
const DHAKA_OFFSET_HOURS = 6;

/** 22 -> "10 PM", 0 -> "12 AM". */
export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

/** The moment after which a student can no longer change meals of `date`: `cutoffHour`:00 on the day before. */
export function studentMealDeadline(date: DateString, cutoffHour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1, cutoffHour - DHAKA_OFFSET_HOURS));
}

/** First date a student may still change at instant `now`: tomorrow before the cutoff, otherwise the day after. */
export function firstStudentMealDate(now: Date, cutoffHour: number, today: DateString): DateString {
  const tomorrow = shiftDate(today, 1);
  return now < studentMealDeadline(tomorrow, cutoffHour) ? tomorrow : shiftDate(today, 2);
}
