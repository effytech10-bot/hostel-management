import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  addMonths,
  currentPeriod,
  dhakaDate,
  periodEnd,
  periodOf,
  periodStart,
  type DateString,
  type Period,
} from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import type { FinanceEntryInput, VoidFinanceEntryInput } from "@/lib/validation/finance";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { nextCounter } from "@/server/counters";
import { db } from "@/server/db/client";
import {
  buildings,
  expenseCategories,
  financeEntries,
  ledgerEntries,
  memberships,
  paymentAccounts,
  payments,
  refunds,
  seatAssignments,
  students,
  tokens,
  type FinanceEntryKind,
  type PaymentMethod,
} from "@/server/db/schema";
import { LEDGER_HEADS, mealCost, type LedgerHead } from "@/server/domain/billing";
import {
  CASH_SOURCES,
  chargedIncome,
  fundOfHead,
  FUNDS,
  sumFunds,
  zeroFunds,
  type Fund,
  type FundMovement,
} from "@/server/domain/finance";
import { AppError } from "@/server/errors";
import { computeMealCounts } from "./meals";
import { getEffectiveRates } from "./rates";

/**
 * Finance: expenses, the three accounts, profit & loss, balance sheet. Admin only.
 *
 * Money IN is never stored twice: it is read from the student ledger (a payment credited to the "meal" head
 * is money in the meal account). Money OUT lives in finance_entries. So the accounts can never disagree with
 * the students' accounts.
 */

const num = (v: unknown) => Number(v ?? 0);
const isCash = (s: string) => (CASH_SOURCES as readonly string[]).includes(s);
/** + for money coming into the account, − for money leaving it. */
const effect = (kind: FinanceEntryKind, amountPaisa: Paisa) => (kind === "owner_deposit" ? amountPaisa : -amountPaisa);

// ---------------------------------------------------------------------------
// Expenses and owner money
// ---------------------------------------------------------------------------

/** Entries can be dated from the 1st of last month up to today (bazar slips are often typed a few days late). */
export function entryDateError(date: DateString, today = dhakaDate()): string | null {
  if (date > today) return "The date cannot be in the future.";
  const earliest = periodStart(addMonths(currentPeriod(), -1));
  if (date < earliest) return `The date cannot be before ${earliest}.`;
  return null;
}

const KIND_TITLE: Record<FinanceEntryKind, string> = {
  expense: "Expense",
  owner_withdraw: "Owner took money out",
  owner_deposit: "Owner put money in",
};

export async function listExpenseCategories(actor: SessionUser): Promise<string[]> {
  assertRole(actor, "admin");
  const rows = await db()
    .select({ name: expenseCategories.name })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.orgId, actor.orgId), eq(expenseCategories.isActive, true)))
    .orderBy(asc(expenseCategories.name));
  return rows.map((r) => r.name);
}

export type SavedEntry = { id: string; voucherNo: string; duplicate: boolean };

export async function createFinanceEntry(actor: SessionUser, input: FinanceEntryInput): Promise<SavedEntry> {
  assertRole(actor, "admin");
  const dateError = entryDateError(input.entryDate);
  if (dateError) throw new AppError("VALIDATION", dateError);

  // Same form submitted twice (double click, network retry): return the first result.
  const [existing] = await db()
    .select({ id: financeEntries.id, voucherNo: financeEntries.voucherNo })
    .from(financeEntries)
    .where(and(eq(financeEntries.orgId, actor.orgId), eq(financeEntries.requestId, input.requestId)))
    .limit(1);
  if (existing) return { ...existing, duplicate: true };

  return db().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.id, input.accountId), eq(paymentAccounts.orgId, actor.orgId)))
      .limit(1);
    if (!account || !account.isActive)
      throw new AppError("VALIDATION", "Choose an active cash / bKash / bank account.");

    if (input.buildingId) {
      const [b] = await tx
        .select({ id: buildings.id })
        .from(buildings)
        .where(and(eq(buildings.id, input.buildingId), eq(buildings.orgId, actor.orgId)))
        .limit(1);
      if (!b) throw new AppError("VALIDATION", "Building not found.");
    }

    let category: { id: string; name: string } | null = null;
    if (input.kind === "expense") {
      const name = input.category!;
      const find = () =>
        tx
          .select({ id: expenseCategories.id, name: expenseCategories.name })
          .from(expenseCategories)
          .where(and(eq(expenseCategories.orgId, actor.orgId), sql`lower(${expenseCategories.name}) = lower(${name})`))
          .limit(1);
      [category] = await find();
      if (!category) {
        await tx.insert(expenseCategories).values({ orgId: actor.orgId, name }).onConflictDoNothing();
        [category] = await find();
        await writeAudit(tx, {
          orgId: actor.orgId,
          actorMembershipId: actor.membershipId,
          action: "expense_category.create",
          entityType: "expense_category",
          entityId: category.id,
          after: { name: category.name },
        });
      }
    }

    const voucherNo = `V-${String(await nextCounter(tx, actor.orgId, "voucher", 1)).padStart(6, "0")}`;
    const title = input.title ?? KIND_TITLE[input.kind];
    const [row] = await tx
      .insert(financeEntries)
      .values({
        orgId: actor.orgId,
        kind: input.kind,
        fund: input.fund,
        accountId: account.id,
        buildingId: input.buildingId,
        categoryId: category?.id ?? null,
        voucherNo,
        title,
        amountPaisa: input.amount,
        entryDate: input.entryDate,
        note: input.note,
        requestId: input.requestId,
        createdBy: actor.membershipId,
      })
      .returning({ id: financeEntries.id });

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: `finance.${input.kind}`,
      entityType: "finance_entry",
      entityId: row.id,
      after: {
        voucherNo,
        title,
        category: category?.name ?? null,
        amountPaisa: input.amount,
        fund: input.fund,
        account: account.name,
        buildingId: input.buildingId,
        entryDate: input.entryDate,
        note: input.note,
      },
    });
    return { id: row.id, voucherNo, duplicate: false };
  });
}

/** Cancel a wrong entry: the original stays (marked void) and an opposite entry is added today. */
export async function voidFinanceEntry(actor: SessionUser, input: VoidFinanceEntryInput): Promise<void> {
  assertRole(actor, "admin");
  await db().transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(financeEntries)
      .where(and(eq(financeEntries.id, input.entryId), eq(financeEntries.orgId, actor.orgId)))
      .for("update")
      .limit(1);
    if (!entry || entry.reversesId) throw new AppError("NOT_FOUND", "Entry not found.");
    if (entry.voidedAt) throw new AppError("CONFLICT", "This entry is already cancelled.");

    const voucherNo = `V-${String(await nextCounter(tx, actor.orgId, "voucher", 1)).padStart(6, "0")}`;
    await tx.insert(financeEntries).values({
      orgId: entry.orgId,
      kind: entry.kind,
      fund: entry.fund,
      accountId: entry.accountId,
      buildingId: entry.buildingId,
      categoryId: entry.categoryId,
      voucherNo,
      title: `Cancelled ${entry.voucherNo}: ${entry.title}`,
      amountPaisa: -entry.amountPaisa,
      entryDate: dhakaDate(),
      note: input.reason,
      reversesId: entry.id,
      createdBy: actor.membershipId,
    });
    await tx
      .update(financeEntries)
      .set({ voidedAt: new Date(), voidedBy: actor.membershipId, voidReason: input.reason })
      .where(eq(financeEntries.id, entry.id));

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "finance.void",
      entityType: "finance_entry",
      entityId: entry.id,
      before: {
        voucherNo: entry.voucherNo,
        kind: entry.kind,
        title: entry.title,
        amountPaisa: entry.amountPaisa,
        fund: entry.fund,
        entryDate: entry.entryDate,
      },
      after: { reason: input.reason, reversedBy: voucherNo },
    });
  });
}

export type EntryFilters = { period: Period; fund?: Fund; kind?: FinanceEntryKind };

/** What the admin typed in a month (the automatic opposite rows of cancelled entries are not listed). */
export async function listFinanceEntries(actor: SessionUser, f: EntryFilters) {
  assertRole(actor, "admin");
  const where = [
    eq(financeEntries.orgId, actor.orgId),
    isNull(financeEntries.reversesId),
    gte(financeEntries.entryDate, periodStart(f.period)),
    lte(financeEntries.entryDate, periodEnd(f.period)),
  ];
  if (f.fund) where.push(eq(financeEntries.fund, f.fund));
  if (f.kind) where.push(eq(financeEntries.kind, f.kind));
  return db()
    .select({
      id: financeEntries.id,
      voucherNo: financeEntries.voucherNo,
      kind: financeEntries.kind,
      fund: financeEntries.fund,
      title: financeEntries.title,
      amountPaisa: financeEntries.amountPaisa,
      entryDate: financeEntries.entryDate,
      note: financeEntries.note,
      voidedAt: financeEntries.voidedAt,
      voidReason: financeEntries.voidReason,
      category: expenseCategories.name,
      accountName: paymentAccounts.name,
      buildingCode: buildings.code,
      byName: memberships.fullName,
    })
    .from(financeEntries)
    .innerJoin(paymentAccounts, eq(paymentAccounts.id, financeEntries.accountId))
    .leftJoin(expenseCategories, eq(expenseCategories.id, financeEntries.categoryId))
    .leftJoin(buildings, eq(buildings.id, financeEntries.buildingId))
    .leftJoin(memberships, eq(memberships.id, financeEntries.createdBy))
    .where(and(...where))
    .orderBy(desc(financeEntries.entryDate), desc(financeEntries.createdAt))
    .limit(500);
}

// ---------------------------------------------------------------------------
// Building blocks (each is one grouped query)
// ---------------------------------------------------------------------------

type Range = { start: DateString; to: DateString };

/** The month as a date range. `to` never passes today, so "closing" of the current month is the balance now. */
function monthRange(period: Period): Range & { until: DateString | undefined } {
  const today = dhakaDate();
  const end = periodEnd(period);
  return { start: periodStart(period), to: end < today ? end : today, until: end < today ? undefined : today };
}

const moneyIn = sql`(${ledgerEntries.creditPaisa} - ${ledgerEntries.debitPaisa})`;
const charged = sql`(${ledgerEntries.debitPaisa} - ${ledgerEntries.creditPaisa})`;

/** Student money that reached each ledger head: before the range, and inside it. */
async function ledgerCash(orgId: string, r: Range) {
  return db()
    .select({
      head: ledgerEntries.head,
      sourceType: ledgerEntries.sourceType,
      before: sql`coalesce(sum(${moneyIn}) filter (where ${ledgerEntries.entryDate} < ${r.start}), 0)`.mapWith(num),
      during: sql`coalesce(sum(${moneyIn}) filter (where ${ledgerEntries.entryDate} >= ${r.start}), 0)`.mapWith(num),
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.orgId, orgId),
        inArray(ledgerEntries.sourceType, [...CASH_SOURCES]),
        lte(ledgerEntries.entryDate, r.to),
      ),
    )
    .groupBy(ledgerEntries.head, ledgerEntries.sourceType);
}

/** Everything in the ledger that belongs to billing month `period` (or to all months up to it). */
async function ledgerOfPeriod(orgId: string, period: Period, upTo = false) {
  const rows = await db()
    .select({
      head: ledgerEntries.head,
      sourceType: ledgerEntries.sourceType,
      amountPaisa: sql`coalesce(sum(${charged}), 0)`.mapWith(num),
    })
    .from(ledgerEntries)
    .where(
      and(eq(ledgerEntries.orgId, orgId), upTo ? lte(ledgerEntries.period, period) : eq(ledgerEntries.period, period)),
    )
    .groupBy(ledgerEntries.head, ledgerEntries.sourceType);
  return rows as { head: LedgerHead; sourceType: string; amountPaisa: Paisa }[];
}

/** Expenses and owner money per account and category: before the range, and inside it. */
async function financeSums(orgId: string, r: Range) {
  return db()
    .select({
      kind: financeEntries.kind,
      fund: financeEntries.fund,
      category: expenseCategories.name,
      before:
        sql`coalesce(sum(${financeEntries.amountPaisa}) filter (where ${financeEntries.entryDate} < ${r.start}), 0)`.mapWith(
          num,
        ),
      during:
        sql`coalesce(sum(${financeEntries.amountPaisa}) filter (where ${financeEntries.entryDate} >= ${r.start}), 0)`.mapWith(
          num,
        ),
    })
    .from(financeEntries)
    .leftJoin(expenseCategories, eq(expenseCategories.id, financeEntries.categoryId))
    .where(and(eq(financeEntries.orgId, orgId), lte(financeEntries.entryDate, r.to)))
    .groupBy(financeEntries.kind, financeEntries.fund, expenseCategories.name);
}

export type Wallet = {
  id: string;
  name: string;
  method: PaymentMethod;
  openingPaisa: Paisa;
  inPaisa: Paisa;
  outPaisa: Paisa;
  closingPaisa: Paisa;
};

/** How much is in the cash box, each bKash / Nagad number and each bank account. */
async function walletBalances(orgId: string, r: Range): Promise<Wallet[]> {
  const split = (date: unknown, amount: unknown) => ({
    before: sql`coalesce(sum(${amount}) filter (where ${date} < ${r.start}::date), 0)`.mapWith(num),
    during: sql`coalesce(sum(${amount}) filter (where ${date} >= ${r.start}::date), 0)`.mapWith(num),
  });
  // A cancelled payment leaves the box on the day it was cancelled, like its ledger rows.
  const voidDate = sql`(${payments.voidedAt} at time zone 'Asia/Dhaka')::date`;
  const [accounts, paid, voided, refunded, entries] = await Promise.all([
    db()
      .select({ id: paymentAccounts.id, name: paymentAccounts.name, method: paymentAccounts.method })
      .from(paymentAccounts)
      .where(eq(paymentAccounts.orgId, orgId))
      .orderBy(asc(paymentAccounts.method), asc(paymentAccounts.name)),
    db()
      .select({ id: payments.accountId, ...split(payments.paidDate, payments.amountPaisa) })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), lte(payments.paidDate, r.to)))
      .groupBy(payments.accountId),
    db()
      .select({ id: payments.accountId, ...split(voidDate, payments.amountPaisa) })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), sql`${voidDate} <= ${r.to}::date`))
      .groupBy(payments.accountId),
    db()
      .select({ id: refunds.accountId, ...split(refunds.paidDate, refunds.amountPaisa) })
      .from(refunds)
      .where(and(eq(refunds.orgId, orgId), lte(refunds.paidDate, r.to)))
      .groupBy(refunds.accountId),
    db()
      .select({
        id: financeEntries.accountId,
        kind: financeEntries.kind,
        ...split(financeEntries.entryDate, financeEntries.amountPaisa),
      })
      .from(financeEntries)
      .where(and(eq(financeEntries.orgId, orgId), lte(financeEntries.entryDate, r.to)))
      .groupBy(financeEntries.accountId, financeEntries.kind),
  ]);

  return accounts.map((a) => {
    const w = { ...a, openingPaisa: 0, inPaisa: 0, outPaisa: 0, closingPaisa: 0 };
    const add = (row: { id: string; before: number; during: number } | undefined, sign: 1 | -1) => {
      if (!row) return;
      w.openingPaisa += sign * row.before;
      if (sign * row.during >= 0) w.inPaisa += sign * row.during;
      else w.outPaisa += -sign * row.during;
    };
    add(
      paid.find((x) => x.id === a.id),
      1,
    );
    add(
      voided.find((x) => x.id === a.id),
      -1,
    );
    add(
      refunded.find((x) => x.id === a.id),
      -1,
    );
    for (const e of entries.filter((x) => x.id === a.id)) add(e, e.kind === "owner_deposit" ? 1 : -1);
    w.closingPaisa = w.openingPaisa + w.inPaisa - w.outPaisa;
    return w;
  });
}

/** Meals of one month: eaten (up to today) and expected (if nobody had turned a meal off), with their money value. */
async function mealMonth(orgId: string, period: Period, until: DateString | undefined) {
  const [effective, eaten, expected] = await Promise.all([
    getEffectiveRates(db(), orgId, period),
    computeMealCounts(db(), orgId, period, null, { until }),
    computeMealCounts(db(), orgId, period, null, { allOn: true }),
  ]);
  const total = (rows: typeof eaten) => ({
    meals: rows.reduce((s, r) => s + r.breakfast + r.lunch + r.dinner, 0),
    halfUnits: rows.reduce((s, r) => s + r.halfUnits, 0),
    costPaisa: effective ? rows.reduce((s, r) => s + mealCost(r, effective.rates), 0) : 0,
  });
  return { eaten: total(eaten), expected: total(expected), students: expected.length, ratesMissing: !effective };
}

/** Each account's totals out of the grouped rows above. */
function fundTotals(cash: Awaited<ReturnType<typeof ledgerCash>>, sums: Awaited<ReturnType<typeof financeSums>>) {
  const out = Object.fromEntries(
    FUNDS.map((f) => [
      f,
      {
        fund: f,
        openingPaisa: 0,
        studentInPaisa: 0,
        movedPaisa: 0,
        refundedPaisa: 0,
        ownerInPaisa: 0,
        ownerOutPaisa: 0,
        expensePaisa: 0,
        expenses: [] as { name: string; amountPaisa: Paisa }[],
        closingPaisa: 0,
      },
    ]),
  ) as Record<Fund, FundMovement & { openingPaisa: Paisa; expensePaisa: Paisa; closingPaisa: Paisa }>;

  for (const r of cash) {
    const t = out[fundOfHead(r.head)];
    t.openingPaisa += r.before;
    if (r.sourceType === "netting") t.movedPaisa += r.during;
    else if (r.sourceType === "refund") t.refundedPaisa += -r.during;
    else t.studentInPaisa += r.during;
  }
  for (const r of sums) {
    const t = out[r.fund];
    t.openingPaisa += effect(r.kind, r.before);
    if (r.kind === "owner_deposit") t.ownerInPaisa += r.during;
    else if (r.kind === "owner_withdraw") t.ownerOutPaisa += r.during;
    else {
      t.expensePaisa += r.during;
      if (r.during !== 0) t.expenses.push({ name: r.category ?? "Other", amountPaisa: r.during });
    }
  }
  for (const f of FUNDS) {
    const t = out[f];
    t.expenses.sort((a, b) => b.amountPaisa - a.amountPaisa);
    t.closingPaisa =
      t.openingPaisa +
      t.studentInPaisa +
      t.movedPaisa -
      t.refundedPaisa +
      t.ownerInPaisa -
      t.ownerOutPaisa -
      t.expensePaisa;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overview (dashboard)
// ---------------------------------------------------------------------------

export async function getFinanceOverview(actor: SessionUser, period: Period) {
  assertRole(actor, "admin");
  const orgId = actor.orgId;
  const range = monthRange(period);

  const [cash, sums, month, wallets, meals, studentRows, [tokenCount]] = await Promise.all([
    ledgerCash(orgId, range),
    financeSums(orgId, range),
    ledgerOfPeriod(orgId, period),
    walletBalances(orgId, range),
    mealMonth(orgId, period, range.until),
    // What every student owes or has with the hostel right now, per head.
    db()
      .select({
        studentId: ledgerEntries.studentId,
        status: students.status,
        head: ledgerEntries.head,
        balance: sql`coalesce(sum(${charged}), 0)`.mapWith(num),
        paid: sql`coalesce(sum(${moneyIn}) filter (where ${ledgerEntries.sourceType} in ('payment','payment_void','netting','opening_payment')), 0)`.mapWith(
          num,
        ),
      })
      .from(ledgerEntries)
      .innerJoin(students, eq(students.id, ledgerEntries.studentId))
      .where(eq(ledgerEntries.orgId, orgId))
      .groupBy(ledgerEntries.studentId, students.status, ledgerEntries.head),
    db()
      .select({ n: sql`count(*)`.mapWith(num) })
      .from(tokens)
      .where(and(eq(tokens.orgId, orgId), eq(tokens.period, period))),
  ]);

  const totals = fundTotals(cash, sums);
  const income = chargedIncome(month);
  income.meal += meals.eaten.costPaisa;

  const dueNow = zeroFunds();
  const creditNow = zeroFunds();
  let advanceHeldPaisa = 0;
  for (const r of studentRows) {
    if (r.balance > 0) dueNow[fundOfHead(r.head)] += r.balance;
    else creditNow[fundOfHead(r.head)] += -r.balance;
    if (r.head === "advance" && r.status === "active") advanceHeldPaisa += Math.max(0, r.paid);
  }

  const of = (head: LedgerHead, sources: string[]) =>
    month.filter((r) => r.head === head && sources.includes(r.sourceType)).reduce((s, r) => s + r.amountPaisa, 0);
  const receivedFor = (heads: LedgerHead[]) =>
    -month.filter((r) => heads.includes(r.head) && isCash(r.sourceType)).reduce((s, r) => s + r.amountPaisa, 0);

  const accounts = FUNDS.map((f) => ({
    ...totals[f],
    incomePaisa: income[f],
    profitPaisa: income[f] - totals[f].expensePaisa,
    dueNowPaisa: dueNow[f],
    creditNowPaisa: creditNow[f],
  }));

  return {
    period,
    asOf: range.to,
    isCurrent: period === currentPeriod(),
    accounts,
    totals: {
      incomePaisa: sumFunds(income),
      expensePaisa: accounts.reduce((s, a) => s + a.expensePaisa, 0),
      profitPaisa: accounts.reduce((s, a) => s + a.profitPaisa, 0),
      inHandPaisa: wallets.reduce((s, w) => s + w.closingPaisa, 0),
      accountsPaisa: accounts.reduce((s, a) => s + a.closingPaisa, 0),
      ownerInPaisa: accounts.reduce((s, a) => s + a.ownerInPaisa, 0),
      ownerOutPaisa: accounts.reduce((s, a) => s + a.ownerOutPaisa, 0),
    },
    rent: {
      tokens: tokenCount?.n ?? 0,
      expectedPaisa: of("rent", ["token", "admission"]),
      changedPaisa: of("rent", ["adjustment", "leave"]),
      receivedPaisa: receivedFor(["rent"]),
      advanceHeldPaisa,
    },
    meal: {
      ...meals,
      /** Deposit and meal bills of this month that students have paid. */
      receivedPaisa: receivedFor(["meal", "baburchi"]),
      costPerMealPaisa:
        meals.eaten.halfUnits > 0 && totals.meal.expensePaisa !== 0
          ? Math.round((totals.meal.expensePaisa * 2) / meals.eaten.halfUnits)
          : null,
    },
    service: {
      chargedPaisa: income.service,
      receivedPaisa: receivedFor(["service_charge", "other"]),
    },
    wallets,
  };
}
export type FinanceOverview = Awaited<ReturnType<typeof getFinanceOverview>>;

// ---------------------------------------------------------------------------
// Cash book of one account
// ---------------------------------------------------------------------------

export type CashbookRow = {
  key: string;
  date: DateString;
  text: string;
  detail: string | null;
  ref: string | null;
  href: string | null;
  /** + money in, − money out. */
  amountPaisa: Paisa;
};

const CASH_TEXT: Record<string, string> = {
  payment: "Payment",
  payment_void: "Payment cancelled",
  netting: "Student's credit moved between accounts",
  refund: "Refund",
};

export async function getCashbook(actor: SessionUser, fund: Fund, period: Period) {
  assertRole(actor, "admin");
  const orgId = actor.orgId;
  const range = monthRange(period);
  const heads = LEDGER_HEADS.filter((h) => fundOfHead(h) === fund);

  const [cash, sums, ledgerRows, entryRows] = await Promise.all([
    ledgerCash(orgId, range),
    financeSums(orgId, range),
    db()
      .select({
        date: ledgerEntries.entryDate,
        sourceType: ledgerEntries.sourceType,
        sourceId: ledgerEntries.sourceId,
        studentId: ledgerEntries.studentId,
        studentName: students.fullName,
        studentCode: students.studentCode,
        receiptNo: payments.receiptNo,
        amountPaisa: sql`sum(${moneyIn})`.mapWith(num),
        at: sql<string>`min(${ledgerEntries.createdAt})`,
      })
      .from(ledgerEntries)
      .innerJoin(students, eq(students.id, ledgerEntries.studentId))
      .leftJoin(
        payments,
        and(eq(payments.id, ledgerEntries.sourceId), inArray(ledgerEntries.sourceType, ["payment", "payment_void"])),
      )
      .where(
        and(
          eq(ledgerEntries.orgId, orgId),
          inArray(ledgerEntries.sourceType, [...CASH_SOURCES]),
          inArray(ledgerEntries.head, heads),
          gte(ledgerEntries.entryDate, range.start),
          lte(ledgerEntries.entryDate, range.to),
        ),
      )
      .groupBy(
        ledgerEntries.entryDate,
        ledgerEntries.sourceType,
        ledgerEntries.sourceId,
        ledgerEntries.studentId,
        students.fullName,
        students.studentCode,
        payments.receiptNo,
      ),
    db()
      .select({
        id: financeEntries.id,
        date: financeEntries.entryDate,
        kind: financeEntries.kind,
        title: financeEntries.title,
        voucherNo: financeEntries.voucherNo,
        amountPaisa: financeEntries.amountPaisa,
        category: expenseCategories.name,
        accountName: paymentAccounts.name,
        at: financeEntries.createdAt,
      })
      .from(financeEntries)
      .innerJoin(paymentAccounts, eq(paymentAccounts.id, financeEntries.accountId))
      .leftJoin(expenseCategories, eq(expenseCategories.id, financeEntries.categoryId))
      .where(
        and(
          eq(financeEntries.orgId, orgId),
          eq(financeEntries.fund, fund),
          gte(financeEntries.entryDate, range.start),
          lte(financeEntries.entryDate, range.to),
        ),
      ),
  ]);

  const rows: (CashbookRow & { at: string })[] = [
    ...ledgerRows
      .filter((r) => r.amountPaisa !== 0)
      .map((r) => ({
        key: `l-${r.sourceType}-${r.sourceId ?? r.studentId}-${r.date}`,
        date: r.date,
        text: `${CASH_TEXT[r.sourceType] ?? r.sourceType} · ${r.studentName}`,
        detail: `ID ${r.studentCode}`,
        ref: r.receiptNo,
        href: r.receiptNo && r.sourceId ? `/receipts/${r.sourceId}` : null,
        amountPaisa: r.amountPaisa,
        at: new Date(r.at).toISOString(),
      })),
    ...entryRows.map((r) => ({
      key: `e-${r.id}`,
      date: r.date,
      text: r.title,
      detail: [r.kind === "expense" ? r.category : KIND_TITLE[r.kind], r.accountName].filter(Boolean).join(" · "),
      ref: r.voucherNo,
      href: null,
      amountPaisa: effect(r.kind, r.amountPaisa),
      at: r.at.toISOString(),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));

  const t = fundTotals(cash, sums)[fund];
  return { fund, period, asOf: range.to, openingPaisa: t.openingPaisa, closingPaisa: t.closingPaisa, rows };
}

// ---------------------------------------------------------------------------
// Profit & loss and balance sheet
// ---------------------------------------------------------------------------

/** First month the hostel has any seat in the software (meals are counted from there). */
async function firstPeriod(orgId: string, fallback: Period): Promise<Period> {
  const [row] = await db()
    .select({ first: sql<string | null>`min(${seatAssignments.startDate})` })
    .from(seatAssignments)
    .where(eq(seatAssignments.orgId, orgId));
  const first = row?.first ? periodOf(String(row.first).slice(0, 10)) : fallback;
  return first < fallback ? first : fallback;
}

export async function getStatements(actor: SessionUser, period: Period) {
  assertRole(actor, "admin");
  const orgId = actor.orgId;
  const range = monthRange(period);

  const months: Period[] = [];
  for (let p = await firstPeriod(orgId, period); p <= period; p = addMonths(p, 1)) months.push(p);

  const [sums, monthLedger, allLedger, wallets, matrix, mealMonths] = await Promise.all([
    financeSums(orgId, range),
    ledgerOfPeriod(orgId, period),
    ledgerOfPeriod(orgId, period, true),
    walletBalances(orgId, range),
    // Per student: charges of months up to this one, and money received up to the last day.
    db()
      .select({
        studentId: ledgerEntries.studentId,
        isCash: sql<boolean>`${ledgerEntries.sourceType} in ('payment','payment_void','netting','refund')`,
        chargedPaisa: sql`coalesce(sum(${charged}) filter (where ${ledgerEntries.period} <= ${period}), 0)`.mapWith(
          num,
        ),
        paidPaisa: sql`coalesce(sum(${moneyIn}) filter (where ${ledgerEntries.entryDate} <= ${range.to}), 0)`.mapWith(
          num,
        ),
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orgId, orgId))
      .groupBy(
        ledgerEntries.studentId,
        sql`${ledgerEntries.sourceType} in ('payment','payment_void','netting','refund')`,
      ),
    // ponytail: one meal count per month since the start; store monthly snapshots if this page gets slow.
    Promise.all(months.map((p) => mealMonth(orgId, p, p === period ? range.until : undefined))),
  ]);

  // ---- profit & loss ----
  const thisMeals = mealMonths[mealMonths.length - 1];
  const eatenAllPaisa = mealMonths.reduce((s, m) => s + m.eaten.costPaisa, 0);
  const incomeMonth = chargedIncome(monthLedger);
  const incomeAll = chargedIncome(allLedger);
  const otherMeal = { month: incomeMonth.meal, all: incomeAll.meal };
  incomeMonth.meal += thisMeals.eaten.costPaisa;
  incomeAll.meal += eatenAllPaisa;

  const expenseMonth = zeroFunds();
  const expenseAll = zeroFunds();
  const categories = new Map<string, { name: string; fund: Fund; monthPaisa: Paisa; allPaisa: Paisa }>();
  let ownerIn = 0;
  let ownerOut = 0;
  for (const r of sums) {
    if (r.kind === "owner_deposit") ownerIn += r.before + r.during;
    else if (r.kind === "owner_withdraw") ownerOut += r.before + r.during;
    else {
      expenseMonth[r.fund] += r.during;
      expenseAll[r.fund] += r.before + r.during;
      const name = r.category ?? "Other";
      const key = `${r.fund}|${name}`;
      const c = categories.get(key) ?? { name, fund: r.fund, monthPaisa: 0, allPaisa: 0 };
      c.monthPaisa += r.during;
      c.allPaisa += r.before + r.during;
      categories.set(key, c);
    }
  }
  const profitAllPaisa = sumFunds(incomeAll) - sumFunds(expenseAll);

  // ---- balance sheet ----
  const perStudent = new Map<string, Paisa>();
  for (const r of matrix) {
    const net = r.isCash ? -r.paidPaisa : r.chargedPaisa;
    perStudent.set(r.studentId, (perStudent.get(r.studentId) ?? 0) + net);
  }
  let receivablePaisa = 0;
  let studentCreditPaisa = 0;
  for (const v of perStudent.values()) {
    if (v > 0) receivablePaisa += v;
    else studentCreditPaisa += -v;
  }
  const sumAll = (pick: (r: (typeof allLedger)[number]) => boolean) =>
    allLedger.filter(pick).reduce((s, r) => s + r.amountPaisa, 0);
  // The advance is the student's money: whatever was charged as advance has to be given back one day.
  const advancePaisa = sumAll(
    (r) => r.head === "advance" && !isCash(r.sourceType) && r.sourceType !== "opening_payment",
  );
  // Meal money billed (deposits + settlements) minus the meals really eaten = billed for days still to come.
  const mealAheadPaisa =
    sumAll((r) => r.head === "meal" && ["token", "admission", "meal_settlement"].includes(r.sourceType)) -
    eatenAllPaisa;
  const openingPaisa =
    sumAll((r) => r.sourceType === "opening" || r.sourceType === "opening_payment") -
    sumAll((r) => r.head === "advance" && r.sourceType === "opening");

  const cashPaisa = wallets.reduce((s, w) => s + w.closingPaisa, 0);
  const assetsPaisa = cashPaisa + receivablePaisa + Math.max(0, -mealAheadPaisa);
  const liabilitiesPaisa = advancePaisa + studentCreditPaisa + Math.max(0, mealAheadPaisa);
  const equityPaisa = assetsPaisa - liabilitiesPaisa;
  const ownerNetPaisa = ownerIn - ownerOut;

  return {
    period,
    asOf: range.to,
    profitLoss: {
      income: FUNDS.map((f) => ({ fund: f, monthPaisa: incomeMonth[f], allPaisa: incomeAll[f] })),
      mealsEaten: { monthPaisa: thisMeals.eaten.costPaisa, allPaisa: eatenAllPaisa, meals: thisMeals.eaten.meals },
      otherMeal,
      expenses: [...categories.values()]
        // A cancelled entry and its opposite row add up to 0: nothing to show.
        .filter((c) => c.monthPaisa !== 0 || c.allPaisa !== 0)
        .sort((a, b) => FUNDS.indexOf(a.fund) - FUNDS.indexOf(b.fund) || b.allPaisa - a.allPaisa),
      expenseByFund: FUNDS.map((f) => ({ fund: f, monthPaisa: expenseMonth[f], allPaisa: expenseAll[f] })),
      profitByFund: FUNDS.map((f) => ({
        fund: f,
        monthPaisa: incomeMonth[f] - expenseMonth[f],
        allPaisa: incomeAll[f] - expenseAll[f],
      })),
      profitMonthPaisa: sumFunds(incomeMonth) - sumFunds(expenseMonth),
      profitAllPaisa,
      ratesMissing: mealMonths.some((m) => m.ratesMissing && m.eaten.meals > 0),
    },
    balanceSheet: {
      wallets,
      cashPaisa,
      receivablePaisa,
      mealNotBilledPaisa: Math.max(0, -mealAheadPaisa),
      assetsPaisa,
      advancePaisa,
      studentCreditPaisa,
      mealAheadPaisa: Math.max(0, mealAheadPaisa),
      liabilitiesPaisa,
      equityPaisa,
      ownerInPaisa: ownerIn,
      ownerOutPaisa: ownerOut,
      profitAllPaisa,
      openingPaisa,
      /** Should be 0: anything else means the books do not explain themselves. */
      differencePaisa: equityPaisa - (ownerNetPaisa + profitAllPaisa + openingPaisa),
    },
  };
}
export type Statements = Awaited<ReturnType<typeof getStatements>>;
