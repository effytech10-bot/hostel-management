/**
 * Joining and leaving in the middle of a month. Pure functions, integer paisa.
 *
 * Mid-month rule (admin setting, per month):
 *   "prorata" – charge only the days the student stays (rent, meal deposit, baburchi)
 *   "full"    – charge the whole month whatever the date
 */
import { daysInPeriod, periodOf, type DateString } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import { advanceAmount, type MidMonthRule, type Rates, type TokenLine } from "./billing";

export type { MidMonthRule };

/** amount × days / daysInMonth, rounded to whole taka. */
export function prorate(amountPaisa: Paisa, days: number, monthDays: number): Paisa {
  if (days >= monthDays) return amountPaisa;
  if (days <= 0) return 0;
  return Math.round((amountPaisa * days) / monthDays / 100) * 100;
}

function dayOfMonth(date: DateString): number {
  return Number(date.slice(8, 10));
}

/** Days from `date` to the end of its month, both included (joining on the 21st of a 30-day month = 10 days). */
export function daysFrom(date: DateString): number {
  return daysInPeriod(periodOf(date)) - dayOfMonth(date) + 1;
}

/**
 * First bill at admission: advance + this month's rent, meal deposit and baburchi.
 * The yearly service charge is not part of it; it comes in the month the admin chooses.
 */
export function admissionLines(input: {
  admissionDate: DateString;
  rentPaisa: Paisa;
  rates: Pick<Rates, "mealDepositPaisa" | "baburchiPaisa" | "advanceMonths">;
  rule: MidMonthRule;
}): { lines: TokenLine[]; days: number; monthDays: number } {
  const monthDays = daysInPeriod(periodOf(input.admissionDate));
  const days = input.rule === "full" ? monthDays : daysFrom(input.admissionDate);
  const partial = days < monthDays;
  const suffix = partial ? ` (${days} of ${monthDays} days)` : "";
  const lines: TokenLine[] = [
    {
      head: "advance",
      label: `Advance (${input.rates.advanceMonths} months rent)`,
      amountPaisa: advanceAmount(input.rentPaisa, input.rates.advanceMonths),
    },
    { head: "rent", label: `Rent${suffix}`, amountPaisa: prorate(input.rentPaisa, days, monthDays) },
    {
      head: "meal",
      label: `Meal deposit${suffix}`,
      amountPaisa: prorate(input.rates.mealDepositPaisa, days, monthDays),
    },
    {
      head: "baburchi",
      label: `Baburchi bill${suffix}`,
      amountPaisa: prorate(input.rates.baburchiPaisa, days, monthDays),
    },
  ];
  return { lines: lines.filter((l) => l.amountPaisa > 0), days, monthDays };
}

/**
 * When a student leaves before the month ends, how much of this month's rent and baburchi is given back.
 * `charged` = what was billed for the month (token or admission bill). The meal deposit is not here:
 * meals are settled exactly (eaten vs deposit).
 */
export function unusedDaysCredit(input: {
  lastDay: DateString;
  chargedRentPaisa: Paisa;
  chargedBaburchiPaisa: Paisa;
  rule: MidMonthRule;
}): { rentPaisa: Paisa; baburchiPaisa: Paisa; unusedDays: number } {
  const monthDays = daysInPeriod(periodOf(input.lastDay));
  const unusedDays = monthDays - dayOfMonth(input.lastDay);
  if (input.rule === "full" || unusedDays <= 0) return { rentPaisa: 0, baburchiPaisa: 0, unusedDays };
  return {
    rentPaisa: prorate(input.chargedRentPaisa, unusedDays, monthDays),
    baburchiPaisa: prorate(input.chargedBaburchiPaisa, unusedDays, monthDays),
    unusedDays,
  };
}
