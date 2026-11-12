/**
 * Income statement of each of the three accounts (Rent & advance, Meal, Service). Pure functions, integer paisa.
 *
 * Earned = what the account charged (rent, service and other charges, admin changes) plus, for Meal, the
 * meals actually eaten × rates. Advance is the student's money and the meal deposit is not income, exactly as
 * in `chargedIncome` (domain/finance.ts): the lines here always add up to the same totals.
 * Spent = expenses typed in Finance for that account. Profit = earned − spent.
 */
import type { Paisa } from "@/lib/money";
import type { LedgerHead } from "./billing";
import { CHARGE_SOURCES, FUNDS, fundOfHead, type Fund } from "./finance";

export type Amounts = { monthPaisa: Paisa; allPaisa: Paisa };
export type StatementLine = Amounts & { key: string; label: string; note?: string };

type LedgerSum = { head: LedgerHead; sourceType: string; amountPaisa: Paisa };

const isCharge = (s: string) => (CHARGE_SOURCES as readonly string[]).includes(s);

/** The line a charge belongs to, or null when it is not income (advance, extra paid, meal deposit). */
function lineOf(head: LedgerHead, sourceType: string): { key: string; label: string; note?: string } | null {
  if (!isCharge(sourceType)) return null;
  if (head === "advance" || head === "credit") return null;
  if (head === "meal" && sourceType !== "adjustment") return null;
  const admin = sourceType === "adjustment";
  const back = sourceType === "leave";
  switch (head) {
    case "rent":
      if (admin) return { key: "rent-admin", label: "Admin changes to rent", note: "extra charge or discount" };
      if (back) return { key: "rent-back", label: "Rent given back", note: "unused days of students who left" };
      return { key: "rent", label: "Rent of the month", note: "monthly and admission tokens" };
    case "meal":
      return { key: "meal-admin", label: "Admin changes to meal bills", note: "extra charge or discount" };
    case "baburchi":
      return { key: "baburchi", label: "Baburchi bill (old months)" };
    case "service_charge":
      if (admin) return { key: "service-admin", label: "Admin changes to service charge" };
      if (back) return { key: "service-back", label: "Service charge given back" };
      return { key: "service", label: "Service charge", note: "one time, at admission" };
    case "other":
      if (admin) return { key: "other-admin", label: "Other charges added by admin" };
      if (back) return { key: "other-back", label: "Other charges given back" };
      return { key: "other", label: "Other charges" };
  }
  return null;
}

/** Earned lines of every account, from ledger sums of the month and of all months up to it. */
export function incomeLines(
  month: readonly LedgerSum[],
  all: readonly LedgerSum[],
  mealsEaten: Amounts & { meals: number },
): Record<Fund, StatementLine[]> {
  const out = Object.fromEntries(FUNDS.map((f) => [f, [] as StatementLine[]])) as Record<Fund, StatementLine[]>;
  out.meal.push({
    key: "meals",
    label: "Meals eaten",
    note: `${mealsEaten.meals} meals this month × the meal rates`,
    monthPaisa: mealsEaten.monthPaisa,
    allPaisa: mealsEaten.allPaisa,
  });
  const add = (r: LedgerSum, which: "monthPaisa" | "allPaisa") => {
    const l = lineOf(r.head, r.sourceType);
    if (!l || r.amountPaisa === 0) return;
    const list = out[fundOfHead(r.head)];
    let line = list.find((x) => x.key === l.key);
    if (!line) {
      line = { ...l, monthPaisa: 0, allPaisa: 0 };
      list.push(line);
    }
    line[which] += r.amountPaisa;
  };
  for (const r of month) add(r, "monthPaisa");
  for (const r of all) add(r, "allPaisa");
  const order = [
    "rent",
    "rent-back",
    "rent-admin",
    "meals",
    "meal-admin",
    "baburchi",
    "service",
    "service-back",
    "service-admin",
    "other",
    "other-back",
    "other-admin",
  ];
  for (const f of FUNDS) {
    out[f] = out[f]
      .filter((l) => l.key === "meals" || l.monthPaisa !== 0 || l.allPaisa !== 0)
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  return out;
}

export const sumLines = (lines: readonly Amounts[]): Amounts => ({
  monthPaisa: lines.reduce((s, l) => s + l.monthPaisa, 0),
  allPaisa: lines.reduce((s, l) => s + l.allPaisa, 0),
});

// ---------------------------------------------------------------------------
// Cash of the month (for the waterfall)
// ---------------------------------------------------------------------------

export type CashStep = { key: string; label: string; amountPaisa: Paisa; kind: "start" | "in" | "out" | "end" };

/** Start → every movement → end, in the order an office reads a cash book. Zero steps are left out. */
export function cashSteps(a: {
  openingPaisa: Paisa;
  studentInPaisa: Paisa;
  movedPaisa: Paisa;
  movedWith?: Partial<Record<Fund, Paisa>>;
  refundedPaisa: Paisa;
  ownerInPaisa: Paisa;
  ownerOutPaisa: Paisa;
  expensePaisa: Paisa;
  closingPaisa: Paisa;
  fundLabel: (f: Fund) => string;
}): CashStep[] {
  const steps: CashStep[] = [
    { key: "start", label: "At the start of the month", amountPaisa: a.openingPaisa, kind: "start" },
  ];
  const push = (key: string, label: string, amountPaisa: Paisa) => {
    if (amountPaisa !== 0) steps.push({ key, label, amountPaisa, kind: amountPaisa > 0 ? "in" : "out" });
  };
  push("students", "Students paid", a.studentInPaisa);
  let named = 0;
  for (const [f, v] of Object.entries(a.movedWith ?? {}) as [Fund, Paisa][]) {
    if (!v) continue;
    named += v;
    push(`moved-${f}`, v > 0 ? `From ${a.fundLabel(f)}` : `To ${a.fundLabel(f)}`, v);
  }
  push("moved", "Student credit moved", a.movedPaisa - named);
  push("refund", "Given back to students", -a.refundedPaisa);
  push("owner-in", "Owner put in", a.ownerInPaisa);
  push("expenses", "Expenses", -a.expensePaisa);
  push("owner-out", "Owner took out", -a.ownerOutPaisa);
  steps.push({ key: "end", label: "At the end", amountPaisa: a.closingPaisa, kind: "end" });
  return steps;
}
