/**
 * The three accounts of the hostel. Pure functions: no database, easy to test. All amounts are integer paisa.
 *
 *   rent    = Rent & advance account   (ledger heads: rent, advance, credit = money paid beyond all dues)
 *   meal    = Meal account             (ledger heads: meal, baburchi)
 *   service = Service account          (ledger heads: service_charge, other)
 *
 * Rules (from the owner, 12 Nov 2026):
 * 1. A payment has a total and a part for each account. Typing only the total fills the accounts in the
 *    hostel's order (Settings; default Rent → Meal → Service). The total is what the student handed over and
 *    never changes when the cashier edits a part: lowering a part moves the difference to the accounts after
 *    it in the order (up to their dues), and anything still left goes to the Meal account.
 * 2. Money beyond all dues goes to the Meal account and is kept there as meal deposit (owner, 12 Nov 2026).
 * 3. Profit of an account = what it earned − what it spent. Advance is the student's money (given back when
 *    they leave), so it is never income. Meal income is the meals actually eaten × the rates, not the deposit.
 * 4. The owner taking money out or putting money in changes the balance, never the profit.
 */
import type { Paisa } from "@/lib/money";
import type { Allocation, Due, LedgerHead } from "./billing";

export const FUNDS = ["rent", "meal", "service"] as const;
export type Fund = (typeof FUNDS)[number];
export type FundAmounts = Record<Fund, Paisa>;

export const FUND_LABEL: Record<Fund, string> = {
  rent: "Rent & advance account",
  meal: "Meal account",
  service: "Service account",
};
export const FUND_SHORT: Record<Fund, string> = { rent: "Rent", meal: "Meal", service: "Service" };
/** Identity colours of the accounts in charts (checked for colour-blind separation). Text never uses them. */
export const FUND_COLOR: Record<Fund, string> = { rent: "#3340b0", meal: "#c9581a", service: "#00918f" };

const HEAD_FUND: Record<LedgerHead, Fund> = {
  rent: "rent",
  advance: "rent",
  credit: "rent",
  meal: "meal",
  baburchi: "meal",
  service_charge: "service",
  other: "service",
};
export const fundOfHead = (head: LedgerHead): Fund => HEAD_FUND[head];

/** The order dues are paid inside one account. */
const FUND_HEADS: Record<Fund, readonly LedgerHead[]> = {
  rent: ["rent", "advance"],
  meal: ["meal", "baburchi"],
  service: ["service_charge", "other"],
};
/** Where money beyond an account's dues is kept until the next token uses it. */
const EXTRA_HEAD: Record<Fund, LedgerHead> = { rent: "credit", meal: "meal", service: "service_charge" };

export const zeroFunds = (): FundAmounts => ({ rent: 0, meal: 0, service: 0 });
export const sumFunds = (a: FundAmounts): Paisa => a.rent + a.meal + a.service;

// ---------------------------------------------------------------------------
// Payment order (Settings)
// ---------------------------------------------------------------------------

export const DEFAULT_FUND_ORDER: readonly Fund[] = ["rent", "meal", "service"];
export const FUND_ORDERS = [
  "rent,meal,service",
  "rent,service,meal",
  "meal,rent,service",
  "meal,service,rent",
  "service,rent,meal",
  "service,meal,rent",
] as const;

/** "meal,rent,service" → ["meal","rent","service"]; anything unexpected → the default order. */
export function parseFundOrder(value: string | null | undefined): Fund[] {
  return (FUND_ORDERS as readonly string[]).includes(value ?? "")
    ? (value!.split(",") as Fund[])
    : [...DEFAULT_FUND_ORDER];
}

export const fundOrderLabel = (order: readonly Fund[]) => order.map((f) => FUND_SHORT[f]).join(" → ");

/** The same order written as ledger heads (used when a student's credit pays their dues on a new token). */
export const headOrder = (order: readonly Fund[]): LedgerHead[] => order.flatMap((f) => FUND_HEADS[f]);

// ---------------------------------------------------------------------------
// Splitting a payment
// ---------------------------------------------------------------------------

/** Unpaid money per account. */
export function fundDues(dues: readonly Due[]): FundAmounts {
  const out = zeroFunds();
  for (const d of dues) if (d.amountPaisa > 0) out[fundOfHead(d.head)] += d.amountPaisa;
  return out;
}

/** Fill the accounts' dues in `order`; whatever is left goes to the Meal account (kept as meal deposit). */
export function splitPayment(totalPaisa: Paisa, dues: FundAmounts, order: readonly Fund[]): FundAmounts {
  if (!Number.isSafeInteger(totalPaisa) || totalPaisa < 0) throw new Error("Payment must be a whole number of paisa.");
  const out = zeroFunds();
  let left = totalPaisa;
  for (const f of order) {
    const take = Math.min(left, Math.max(0, dues[f]));
    out[f] = take;
    left -= take;
  }
  out.meal += left;
  return out;
}

/**
 * The cashier typed a new amount in one account's box. The total stays what the student handed over:
 * accounts before the changed one (in the hostel's order) keep their amounts, accounts after it are filled
 * again up to their dues, and money still left goes to the Meal account.
 * `unplacedPaisa` > 0 = money that is in no account (only when the Meal box itself was changed),
 * < 0 = the boxes add up to more than the total. Either way the form must not be saved until it is 0.
 */
export function rebalanceParts(
  totalPaisa: Paisa,
  current: FundAmounts,
  dues: FundAmounts,
  order: readonly Fund[],
  changed: Fund,
): { parts: FundAmounts; unplacedPaisa: Paisa } {
  const parts = { ...current };
  const at = order.indexOf(changed);
  let left = totalPaisa - order.slice(0, at + 1).reduce((s, f) => s + parts[f], 0);
  const after = order.slice(at + 1);
  for (const f of after) {
    parts[f] = Math.min(Math.max(0, left), Math.max(0, dues[f]));
    left -= parts[f];
  }
  if (left > 0 && changed !== "meal") {
    parts.meal += left;
    left = 0;
  }
  return { parts, unplacedPaisa: left };
}

/**
 * Turn the three parts of a payment into ledger credits: inside an account the oldest month is paid first,
 * and money beyond that account's dues is kept on the account as credit for `extraPeriod`.
 */
export function allocateByFund(dues: readonly Due[], amounts: FundAmounts, extraPeriod: string): Allocation[] {
  const merged = new Map<string, Allocation>();
  const add = (head: LedgerHead, period: string, amountPaisa: Paisa) => {
    const key = `${period}|${head}`;
    const prev = merged.get(key);
    if (prev) prev.amountPaisa += amountPaisa;
    else merged.set(key, { head, period, amountPaisa });
  };
  for (const f of FUNDS) {
    let left = amounts[f];
    if (!Number.isSafeInteger(left) || left < 0) throw new Error("Each part must be zero or more.");
    const own = dues
      .filter((d) => d.amountPaisa > 0 && fundOfHead(d.head) === f)
      .sort(
        (a, b) => a.period.localeCompare(b.period) || FUND_HEADS[f].indexOf(a.head) - FUND_HEADS[f].indexOf(b.head),
      );
    for (const d of own) {
      if (left === 0) break;
      const take = Math.min(left, d.amountPaisa);
      add(d.head, d.period, take);
      left -= take;
    }
    if (left > 0) add(EXTRA_HEAD[f], extraPeriod, left);
  }
  return [...merged.values()];
}

/** Total per account of some ledger amounts. */
export function byFund(rows: readonly { head: LedgerHead; amountPaisa: Paisa }[]): FundAmounts {
  const out = zeroFunds();
  for (const r of rows) out[fundOfHead(r.head)] += r.amountPaisa;
  return out;
}

/** The boxes of the paper money receipt, from what one payment was credited to. */
export function receiptBoxes(rows: readonly { head: LedgerHead; amountPaisa: Paisa }[]) {
  const sum = (heads: LedgerHead[]) =>
    rows.filter((r) => heads.includes(r.head)).reduce((s, r) => s + r.amountPaisa, 0);
  return {
    rentPaisa: sum(["rent", "credit"]),
    advancePaisa: sum(["advance"]),
    mealPaisa: sum(["meal", "baburchi"]),
    servicePaisa: sum(["service_charge", "other"]),
  };
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

/** Ledger sources that move real money (a student paid, a payment was cancelled, credit moved, a refund). */
export const CASH_SOURCES = ["payment", "payment_void", "netting", "refund"] as const;
/** Ledger sources that are a charge (or a discount on a charge) made by the hostel. */
export const CHARGE_SOURCES = ["token", "admission", "adjustment", "leave"] as const;

const isCharge = (s: string) => (CHARGE_SOURCES as readonly string[]).includes(s);

/**
 * What the accounts earned from charges in the ledger, WITHOUT the meals eaten (added separately):
 * rent and service charges count in full; advance is not income; the meal deposit is not income
 * (only a hand-made change to a meal bill is).
 */
export function chargedIncome(
  rows: readonly { head: LedgerHead; sourceType: string; amountPaisa: Paisa }[],
): FundAmounts {
  const out = zeroFunds();
  for (const r of rows) {
    if (!isCharge(r.sourceType)) continue;
    if (r.head === "advance" || r.head === "credit") continue;
    if (r.head === "meal" && r.sourceType !== "adjustment") continue;
    out[fundOfHead(r.head)] += r.amountPaisa;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Money flow picture (in → accounts → out)
// ---------------------------------------------------------------------------

export type FundMovement = {
  fund: Fund;
  /** Student payments minus cancelled payments. */
  studentInPaisa: Paisa;
  /** Student credit moved between accounts: + came in, − went out. */
  movedPaisa: Paisa;
  /**
   * The same, per other account: a student's extra money kept in one account paid their due in another
   * (on a new token or when leaving). + came from that account, − went to it. No money was transferred by hand.
   */
  movedWith?: Partial<Record<Fund, Paisa>>;
  refundedPaisa: Paisa;
  ownerInPaisa: Paisa;
  ownerOutPaisa: Paisa;
  expenses: { name: string; amountPaisa: Paisa }[];
};

export type FlowNode = { id: string; label: string; amountPaisa: Paisa };
export type FlowLink = { from: string; to: string; fund: Fund; amountPaisa: Paisa };
export type Flow = { left: FlowNode[]; middle: FlowNode[]; right: FlowNode[]; links: FlowLink[] };

const LEFT_LABEL: Record<string, string> = {
  students: "Students paid",
  owner_in: "Owner put in",
  earlier: "Used from earlier balance",
};
const RIGHT_LABEL: Record<string, string> = {
  refund: "Given back to students",
  owner_out: "Owner took out",
  kept: "Stayed in the accounts",
};

/**
 * Every taka that came into an account either went out or stayed, so both sides of each account are equal:
 * spending more than came in shows as "Used from earlier balance", the opposite as "Stayed in the accounts".
 */
export function buildFlow(movements: readonly FundMovement[], maxCategories = 6): Flow {
  const totals = new Map<string, Paisa>();
  for (const m of movements)
    for (const e of m.expenses) if (e.amountPaisa > 0) totals.set(e.name, (totals.get(e.name) ?? 0) + e.amountPaisa);
  const top = new Set(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, totals.size > maxCategories ? maxCategories - 1 : maxCategories)
      .map(([name]) => name),
  );

  const links: FlowLink[] = [];
  const link = (from: string, to: string, fund: Fund, amountPaisa: Paisa) => {
    if (amountPaisa <= 0) return;
    const prev = links.find((l) => l.from === from && l.to === to);
    if (prev) prev.amountPaisa += amountPaisa;
    else links.push({ from, to, fund, amountPaisa });
  };

  for (const m of movements) {
    const f = `fund:${m.fund}`;
    link("students", f, m.fund, Math.max(0, m.studentInPaisa));
    link("owner_in", f, m.fund, m.ownerInPaisa);
    const withOther = Object.entries(m.movedWith ?? {}) as [Fund, Paisa][];
    for (const [other, amount] of withOther) {
      link(`from:${other}`, f, m.fund, Math.max(0, amount));
      link(f, `to:${other}`, m.fund, Math.max(0, -amount));
    }
    const namedIn = withOther.reduce((s, [, a]) => s + Math.max(0, a), 0);
    const namedOut = withOther.reduce((s, [, a]) => s + Math.max(0, -a), 0);
    link("moved_in", f, m.fund, Math.max(0, m.movedPaisa) - namedIn);
    for (const e of m.expenses) link(f, top.has(e.name) ? `cat:${e.name}` : "cat:", m.fund, e.amountPaisa);
    link(f, "refund", m.fund, m.refundedPaisa + Math.max(0, -m.studentInPaisa));
    link(f, "owner_out", m.fund, m.ownerOutPaisa);
    link(f, "moved_out", m.fund, Math.max(0, -m.movedPaisa) - namedOut);
    const sum = (side: "from" | "to") => links.filter((l) => l[side] === f).reduce((s, l) => s + l.amountPaisa, 0);
    const kept = sum("to") - sum("from");
    link(f, "kept", m.fund, kept);
    link("earlier", f, m.fund, -kept);
  }

  const node = (id: string, label: string, side: "from" | "to"): FlowNode => ({
    id,
    label,
    amountPaisa: links.filter((l) => l[side] === id).reduce((s, l) => s + l.amountPaisa, 0),
  });
  const used = (id: string) => links.some((l) => l.from === id || l.to === id);
  const categories = [...new Set(links.filter((l) => l.to.startsWith("cat:")).map((l) => l.to))]
    .map((id) => node(id, id === "cat:" ? "Other expenses" : id.slice(4), "to"))
    .sort((a, b) => Number(a.id === "cat:") - Number(b.id === "cat:") || b.amountPaisa - a.amountPaisa);

  const fromOther = FUNDS.filter((o) => used(`from:${o}`)).map((o) =>
    node(`from:${o}`, `From ${FUND_LABEL[o]}`, "from"),
  );
  const toOther = FUNDS.filter((o) => used(`to:${o}`)).map((o) => node(`to:${o}`, `To ${FUND_LABEL[o]}`, "to"));
  const leftIds = ["students", "owner_in"];
  return {
    left: [
      ...leftIds.filter(used).map((id) => node(id, LEFT_LABEL[id], "from")),
      ...fromOther,
      ...(used("moved_in") ? [node("moved_in", "From another account", "from")] : []),
      ...(used("earlier") ? [node("earlier", LEFT_LABEL.earlier, "from")] : []),
    ],
    middle: movements
      .filter((m) => used(`fund:${m.fund}`))
      .map((m) => node(`fund:${m.fund}`, FUND_LABEL[m.fund], "to")),
    right: [
      ...categories,
      ...["refund", "owner_out"].filter(used).map((id) => node(id, RIGHT_LABEL[id], "to")),
      ...toOther,
      ...(used("moved_out") ? [node("moved_out", "To another account", "to")] : []),
      ...(used("kept") ? [node("kept", RIGHT_LABEL.kept, "to")] : []),
    ],
    links,
  };
}

/**
 * Which account a "netting" ledger row moved money from / to. Rows are written in pairs by the token engine
 * and the leave service: the head that received money says "Paid from <head>", the one that gave it
 * "Used for <head>". Returns the other account, or null when the text is not one of these.
 */
export function nettingOtherFund(description: string | null | undefined): Fund | null {
  const m = /^(?:Paid from|Used for) ([a-z_]+)$/.exec(description ?? "");
  const head = m?.[1] as LedgerHead | undefined;
  return head && head in HEAD_FUND ? HEAD_FUND[head] : null;
}
