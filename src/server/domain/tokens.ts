/**
 * Token rules (a token = one month's bill + its payments). Pure functions, integer paisa.
 *
 * - One token per student per month. Made automatically on the 1st at 00:05 for that month,
 *   or earlier by the admin (then the 1st skips that student).
 * - Sections: "this month" (month rent + meal deposit) and "due" (monthly due, pre meal,
 *   advance / service charge, extra paid).
 * - Pre meal = meals eaten from the day after the previous token's meal days up to the token's cut-off,
 *   minus the meal money billed on the previous token. Days after the cut-off go to the next token.
 * - Admission (any day): the token is for the NEXT month. The rest of the admission month
 *   (rent by days + its meals) is shown as due with the dates, with the advance and the one-time
 *   service charge.
 */
import { addMonths, daysInPeriod, periodEnd, periodOf, type DateString, type Period } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import { advanceAmount, type LedgerHead, type MidMonthRule } from "./billing";
import { daysFrom, prorate } from "./stay";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2611-207601A-001: year+month, building+room+seat (letters and digits only), last 3 digits of the Student ID. */
export function tokenCode(input: {
  period: Period;
  buildingCode: string;
  roomNumber: string;
  seatLabel: string;
  studentCode: string;
}): string {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const yymm = input.period.slice(2, 4) + input.period.slice(5, 7);
  return `${yymm}-${clean(input.buildingCode)}${clean(input.roomNumber)}${clean(input.seatLabel)}-${input.studentCode.slice(-3).padStart(3, "0")}`;
}

/** Normalise what a cashier types: spaces removed, upper case. */
export function normalizeTokenQuery(q: string): string {
  return q.trim().toUpperCase().replace(/\s+/g, "");
}

/** "25 – 30 Sep", "25 Sep – 31 Oct", "20 Nov". */
export function dayRange(from: DateString, to: DateString): string {
  const d = (x: DateString) => Number(x.slice(8, 10));
  const m = (x: DateString) => MON[Number(x.slice(5, 7)) - 1];
  if (from === to) return `${d(from)} ${m(from)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${d(from)} – ${d(to)} ${m(to)}`;
  return `${d(from)} ${m(from)} – ${d(to)} ${m(to)}`;
}

/** "Oct 2026" */
export function shortMonth(period: Period): string {
  return `${MON[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

export type TokenSection = "current" | "due";

export type TokenLineDraft = {
  section: TokenSection;
  head: LedgerHead;
  label: string;
  detail: string | null;
  amountPaisa: Paisa;
  /** true = a new charge posted to the ledger with this token; false = a snapshot of what was already owed. */
  post: boolean;
};

/** "This month": month rent and meal deposit. */
export function monthLines(input: { period: Period; rentPaisa: Paisa; mealDepositPaisa: Paisa }): TokenLineDraft[] {
  const month = shortMonth(input.period);
  const lines: TokenLineDraft[] = [
    { section: "current", head: "rent", label: "Month rent", detail: month, amountPaisa: input.rentPaisa, post: true },
    {
      section: "current",
      head: "meal",
      label: "Meal deposit",
      detail: month,
      amountPaisa: input.mealDepositPaisa,
      post: true,
    },
  ];
  return lines.filter((l) => l.amountPaisa > 0);
}

const DUE_LABEL: Record<LedgerHead, string> = {
  rent: "Monthly due",
  meal: "Pre meal",
  baburchi: "Baburchi due",
  service_charge: "Service charge due",
  advance: "Advance due",
  other: "Other due",
  credit: "Extra paid",
};
const DUE_ORDER: LedgerHead[] = ["rent", "meal", "advance", "service_charge", "baburchi", "other", "credit"];

/**
 * "Due": what the student's account already shows per head when the token is made
 * (after the pre-meal settlement was posted). Negative = money the student has with the hostel.
 */
export function dueLines(
  balances: Partial<Record<LedgerHead, Paisa>>,
  details: Partial<Record<LedgerHead, string | null>> = {},
): TokenLineDraft[] {
  return DUE_ORDER.filter((h) => (balances[h] ?? 0) !== 0).map((head) => ({
    section: "due" as const,
    head,
    label: DUE_LABEL[head],
    detail: details[head] ?? null,
    amountPaisa: balances[head]!,
    post: false,
  }));
}

/** The month an admission token is for: always the month after the admission date. */
export const admissionTokenPeriod = (admissionDate: DateString): Period => addMonths(periodOf(admissionDate), 1);

/**
 * Lines of the first token at admission. All are new charges (posted):
 * this month = next month's rent + meal deposit;
 * due = rent for the rest of the admission month (by days), those days' meals, advance, service charge.
 */
export function admissionDrafts(input: {
  admissionDate: DateString;
  rentPaisa: Paisa;
  /** Meals planned from the admission date to the month end × that month's rates. */
  restOfMonthMealsPaisa: Paisa;
  mealDepositPaisa: Paisa;
  advanceMonths: number;
  serviceChargePaisa: Paisa;
  rule: MidMonthRule;
}): { period: Period; lines: TokenLineDraft[]; restDays: number; monthDays: number } {
  const period = admissionTokenPeriod(input.admissionDate);
  const admissionMonth = periodOf(input.admissionDate);
  const monthDays = daysInPeriod(admissionMonth);
  const restDays = daysFrom(input.admissionDate);
  const range = dayRange(input.admissionDate, periodEnd(admissionMonth));
  const restRent = input.rule === "full" ? input.rentPaisa : prorate(input.rentPaisa, restDays, monthDays);
  const lines: TokenLineDraft[] = [
    ...monthLines({ period, rentPaisa: input.rentPaisa, mealDepositPaisa: input.mealDepositPaisa }),
    { section: "due", head: "rent", label: "Monthly due", detail: range, amountPaisa: restRent, post: true },
    {
      section: "due",
      head: "meal",
      label: "Pre meal",
      detail: range,
      amountPaisa: input.restOfMonthMealsPaisa,
      post: true,
    },
    {
      section: "due",
      head: "advance",
      label: "Advance",
      detail: `${input.advanceMonths} months rent`,
      amountPaisa: advanceAmount(input.rentPaisa, input.advanceMonths),
      post: true,
    },
    {
      section: "due",
      head: "service_charge",
      label: "Service charge",
      detail: "One time",
      amountPaisa: input.serviceChargePaisa,
      post: true,
    },
  ];
  return { period, lines: lines.filter((l) => l.amountPaisa > 0), restDays, monthDays };
}

export const totalOf = (lines: readonly TokenLineDraft[]) => lines.reduce((s, l) => s + l.amountPaisa, 0);

/**
 * The last day whose meals a token settles. On the 1st (automatic run) = the last day of the previous month.
 * Made early on day D = D itself (its meals were locked the night before).
 */
export function mealCutoff(tokenPeriod: Period, today: DateString): DateString {
  const lastOfPrevious = periodEnd(addMonths(tokenPeriod, -1));
  return today < lastOfPrevious ? today : lastOfPrevious;
}

export type TokenState = "paid" | "partial" | "unpaid" | "carried";

/** A newer token takes over what is still unpaid: an older token is either paid or "carried". */
export function tokenState(input: { isLatest: boolean; remainingPaisa: Paisa; paidPaisa: Paisa }): TokenState {
  if (input.remainingPaisa <= 0) return "paid";
  if (!input.isLatest) return "carried";
  return input.paidPaisa > 0 ? "partial" : "unpaid";
}
