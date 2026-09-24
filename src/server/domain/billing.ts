/**
 * Money rules for student billing. Pure functions: no database, easy to test.
 * All amounts are integer paisa (৳1 = 100).
 *
 * The student's account has separate "heads" (pockets): rent, meal, baburchi, service charge, advance,
 * other, and credit (money paid in excess). Each head's balance is SUM(debit − credit):
 * positive = the student owes, negative = the student has money with the hostel.
 *
 * Rules chosen (confirm with the client):
 * 1. The meal deposit is billed at the start of the month on the "meal" head.
 * 2. At month end, meal cost = meals × rates. The difference (cost − deposit) is posted to the "meal" head,
 *    so the next token shows it as "Previous meal balance" (+ due, − credit).
 * 3. Baburchi is a separate monthly charge. It is NOT also taken from the meal deposit (no double charge).
 */
import { multiplyPaisa, sumPaisa, type Paisa } from "@/lib/money";

export const LEDGER_HEADS = ["rent", "meal", "baburchi", "service_charge", "advance", "other", "credit"] as const;
export type LedgerHead = (typeof LEDGER_HEADS)[number];

export const HEAD_LABEL: Record<LedgerHead, string> = {
  rent: "Rent",
  meal: "Meal",
  baburchi: "Baburchi bill",
  service_charge: "Service charge",
  advance: "Advance",
  other: "Other",
  credit: "Extra paid (credit)",
};

/** Order a payment pays things off, within the same month. Oldest month is always paid first. */
export const DEFAULT_ALLOCATION_ORDER: readonly LedgerHead[] = [
  "meal",
  "rent",
  "baburchi",
  "service_charge",
  "advance",
  "other",
];

export type MidMonthRule = "prorata" | "full";

export type Rates = {
  breakfastRatePaisa: Paisa;
  lunchRatePaisa: Paisa;
  dinnerRatePaisa: Paisa;
  mealDepositPaisa: Paisa;
  baburchiPaisa: Paisa;
  serviceChargePaisa: Paisa;
  serviceChargeThisMonth: boolean;
  advanceMonths: number;
  midMonthRule: MidMonthRule;
};

export type MealCountsForCost = { breakfast: number; lunch: number; dinner: number };

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export function mealCost(
  counts: MealCountsForCost,
  rates: Pick<Rates, "breakfastRatePaisa" | "lunchRatePaisa" | "dinnerRatePaisa">,
): Paisa {
  return sumPaisa([
    multiplyPaisa(rates.breakfastRatePaisa, counts.breakfast),
    multiplyPaisa(rates.lunchRatePaisa, counts.lunch),
    multiplyPaisa(rates.dinnerRatePaisa, counts.dinner),
  ]);
}

export type MealSettlement = {
  costPaisa: Paisa;
  depositPaisa: Paisa;
  /** cost − deposit. Positive: the student owes more. Negative: the student gets money back / credit. */
  differencePaisa: Paisa;
  /** The ledger line to post on the "meal" head (or null when exactly even). */
  entry: { debitPaisa: Paisa; creditPaisa: Paisa } | null;
};

export function mealSettlement(input: {
  counts: MealCountsForCost;
  depositPaisa: Paisa;
  rates: Pick<Rates, "breakfastRatePaisa" | "lunchRatePaisa" | "dinnerRatePaisa">;
}): MealSettlement {
  const costPaisa = mealCost(input.counts, input.rates);
  const differencePaisa = costPaisa - input.depositPaisa;
  return {
    costPaisa,
    depositPaisa: input.depositPaisa,
    differencePaisa,
    entry:
      differencePaisa === 0
        ? null
        : differencePaisa > 0
          ? { debitPaisa: differencePaisa, creditPaisa: 0 }
          : { debitPaisa: 0, creditPaisa: -differencePaisa },
  };
}

// ---------------------------------------------------------------------------
// Advance
// ---------------------------------------------------------------------------

export function advanceAmount(rentPaisa: Paisa, months: number): Paisa {
  return multiplyPaisa(rentPaisa, months);
}

// ---------------------------------------------------------------------------
// Monthly token
// ---------------------------------------------------------------------------

export type TokenLine = { head: LedgerHead; label: string; amountPaisa: Paisa };

export type Token = {
  /** Charges for this month. */
  current: TokenLine[];
  /** What was already on the account before this month (+ due, − credit). */
  previous: TokenLine[];
  currentTotalPaisa: Paisa;
  previousTotalPaisa: Paisa;
  /** To be paid. Can be negative when the student has more credit than this month's bill. */
  totalPaisa: Paisa;
};

const PREVIOUS_LABEL: Record<LedgerHead, string> = {
  rent: "Previous rent due",
  meal: "Previous meal balance",
  baburchi: "Previous baburchi due",
  service_charge: "Service charge due",
  advance: "Advance due",
  other: "Other due",
  credit: "Extra paid (credit)",
};

/**
 * This month's charges for an active student, plus everything carried from before.
 * `previousBalances` = each head's balance before this month's charges are posted.
 */
export function buildToken(input: {
  rentPaisa: Paisa;
  rates: Pick<Rates, "mealDepositPaisa" | "baburchiPaisa" | "serviceChargePaisa" | "serviceChargeThisMonth">;
  previousBalances: Partial<Record<LedgerHead, Paisa>>;
}): Token {
  const current: TokenLine[] = [
    { head: "rent", label: "Rent", amountPaisa: input.rentPaisa },
    { head: "meal", label: "Meal deposit", amountPaisa: input.rates.mealDepositPaisa },
    { head: "baburchi", label: "Baburchi bill", amountPaisa: input.rates.baburchiPaisa },
  ];
  if (input.rates.serviceChargeThisMonth && input.rates.serviceChargePaisa > 0) {
    current.push({
      head: "service_charge",
      label: "Service charge (yearly)",
      amountPaisa: input.rates.serviceChargePaisa,
    });
  }
  const currentLines = current.filter((l) => l.amountPaisa !== 0);

  const previous: TokenLine[] = LEDGER_HEADS.filter((h) => (input.previousBalances[h] ?? 0) !== 0).map((head) => ({
    head,
    label: PREVIOUS_LABEL[head],
    amountPaisa: input.previousBalances[head]!,
  }));

  const currentTotalPaisa = sumPaisa(currentLines.map((l) => l.amountPaisa));
  const previousTotalPaisa = sumPaisa(previous.map((l) => l.amountPaisa));
  return {
    current: currentLines,
    previous,
    currentTotalPaisa,
    previousTotalPaisa,
    totalPaisa: currentTotalPaisa + previousTotalPaisa,
  };
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export type LedgerLine = { head: LedgerHead; period: string; debitPaisa: Paisa; creditPaisa: Paisa };

/** Balance per head (+ due, − credit). Heads with zero balance are left out. */
export function balancesByHead(lines: readonly LedgerLine[]): Partial<Record<LedgerHead, Paisa>> {
  const result: Partial<Record<LedgerHead, Paisa>> = {};
  for (const l of lines) result[l.head] = (result[l.head] ?? 0) + l.debitPaisa - l.creditPaisa;
  for (const h of LEDGER_HEADS) if (result[h] === 0) delete result[h];
  return result;
}

export type Due = { head: LedgerHead; period: string; amountPaisa: Paisa };

/**
 * Unpaid amounts per (month, head), oldest month first.
 * Within a head, all credits (payments, meal under-use) pay that head's charges oldest-first,
 * whatever month the credit line was posted in.
 */
export function openDues(lines: readonly LedgerLine[]): Due[] {
  const result: Due[] = [];
  for (const head of LEDGER_HEADS) {
    if (head === "credit") continue;
    const headLines = lines.filter((l) => l.head === head);
    let credit = headLines.reduce((sum, l) => sum + l.creditPaisa, 0);
    const debitsByPeriod = new Map<string, Paisa>();
    for (const l of headLines) {
      if (l.debitPaisa > 0) debitsByPeriod.set(l.period, (debitsByPeriod.get(l.period) ?? 0) + l.debitPaisa);
    }
    for (const period of [...debitsByPeriod.keys()].sort()) {
      const charged = debitsByPeriod.get(period)!;
      const paid = Math.min(credit, charged);
      credit -= paid;
      if (charged - paid > 0) result.push({ head, period, amountPaisa: charged - paid });
    }
  }
  return result.sort(
    (a, b) => a.period.localeCompare(b.period) || LEDGER_HEADS.indexOf(a.head) - LEDGER_HEADS.indexOf(b.head),
  );
}

// ---------------------------------------------------------------------------
// Payment allocation
// ---------------------------------------------------------------------------

export type Allocation = { head: LedgerHead; period: string; amountPaisa: Paisa };

/**
 * Split a payment across the student's dues: oldest month first, then by head order.
 * Anything left over becomes credit ("extra paid") that counts against the next bill.
 */
export function allocatePayment(
  dues: readonly Due[],
  amountPaisa: Paisa,
  order: readonly LedgerHead[] = DEFAULT_ALLOCATION_ORDER,
): { allocations: Allocation[]; leftoverPaisa: Paisa } {
  if (!Number.isSafeInteger(amountPaisa) || amountPaisa <= 0) throw new Error("Payment must be more than zero.");
  const rank = (h: LedgerHead) => {
    const i = order.indexOf(h);
    return i === -1 ? order.length : i;
  };
  const sorted = dues
    .filter((d) => d.amountPaisa > 0)
    .sort((a, b) => a.period.localeCompare(b.period) || rank(a.head) - rank(b.head));

  let remaining = amountPaisa;
  const allocations: Allocation[] = [];
  for (const due of sorted) {
    if (remaining === 0) break;
    const take = Math.min(remaining, due.amountPaisa);
    allocations.push({ head: due.head, period: due.period, amountPaisa: take });
    remaining -= take;
  }
  return { allocations, leftoverPaisa: remaining };
}

/**
 * Use money the student already has with the hostel (extra paid, meal credit) to clear dues on other heads.
 * Returns the transfers to post: credit the due head, debit the head the money came from.
 */
export function netCredits(
  balances: Partial<Record<LedgerHead, Paisa>>,
  order: readonly LedgerHead[] = DEFAULT_ALLOCATION_ORDER,
): { fromHead: LedgerHead; toHead: LedgerHead; amountPaisa: Paisa }[] {
  // Plain extra money ("credit") is used first, then credit sitting in other heads (e.g. meal under-use).
  const creditOrder: LedgerHead[] = ["credit", ...LEDGER_HEADS.filter((h) => h !== "credit")];
  const credits = creditOrder
    .filter((h) => (balances[h] ?? 0) < 0)
    .map((h) => ({ head: h, left: -(balances[h] ?? 0) }));
  const dues = order.filter((h) => (balances[h] ?? 0) > 0).map((h) => ({ head: h, left: balances[h] ?? 0 }));
  const transfers: { fromHead: LedgerHead; toHead: LedgerHead; amountPaisa: Paisa }[] = [];
  for (const due of dues) {
    for (const credit of credits) {
      if (due.left === 0) break;
      if (credit.left === 0 || credit.head === due.head) continue;
      const amount = Math.min(due.left, credit.left);
      transfers.push({ fromHead: credit.head, toHead: due.head, amountPaisa: amount });
      due.left -= amount;
      credit.left -= amount;
    }
  }
  return transfers;
}

// ---------------------------------------------------------------------------
// Token status
// ---------------------------------------------------------------------------

export type TokenStatus = "paid" | "partial" | "unpaid";

/**
 * How much of a token is still unpaid, from the student's ledger.
 * A token asks for everything due up to its month (this month's charges + older dues).
 * Payments clear the oldest dues first, so "still unpaid" = open dues of months up to the token's month.
 */
export function tokenPaymentStatus(
  lines: readonly LedgerLine[],
  tokenPeriod: string,
  tokenTotalPaisa: Paisa,
): { remainingPaisa: Paisa; paidPaisa: Paisa; status: TokenStatus } {
  const remainingPaisa = openDues(lines)
    .filter((d) => d.period <= tokenPeriod)
    .reduce((sum, d) => sum + d.amountPaisa, 0);
  const asked = Math.max(tokenTotalPaisa, 0);
  const paidPaisa = Math.max(0, Math.min(asked, asked - remainingPaisa));
  const status: TokenStatus = remainingPaisa <= 0 ? "paid" : paidPaisa > 0 ? "partial" : "unpaid";
  return { remainingPaisa: Math.max(0, remainingPaisa), paidPaisa, status };
}
