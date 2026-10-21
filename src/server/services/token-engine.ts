import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, lte, min, sql } from "drizzle-orm";
import {
  addMonths,
  formatPeriod,
  periodEnd,
  periodOf,
  periodStart,
  previousPeriod,
  type DateString,
  type Period,
} from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import { writeAudit } from "@/server/audit";
import { db, type DbOrTx, type Transaction } from "@/server/db/client";
import {
  billingPeriods,
  buildings,
  ledgerEntries,
  mealSettlements,
  rooms,
  seatAssignments,
  seats,
  students,
  tokenLines,
  tokens,
} from "@/server/db/schema";
import {
  balancesByHead,
  DEFAULT_ALLOCATION_ORDER,
  mealCost,
  netCredits,
  openDues,
  type LedgerHead,
  type LedgerLine,
} from "@/server/domain/billing";
import { shiftDate } from "@/server/domain/meals";
import {
  admissionDrafts,
  dayRange,
  dueLines,
  mealCutoff,
  monthLines,
  shortMonth,
  tokenCode,
  totalOf,
  type TokenLineDraft,
} from "@/server/domain/tokens";
import { AppError } from "@/server/errors";
import { postLedger, type NewLedgerEntry } from "./ledger";
import { computeMealCounts } from "./meals";
import { getEffectiveRates } from "./rates";

/**
 * Making tokens: the monthly run on the 1st, the admin's early token, and the admission token.
 * One token per student per month (unique in the database too). See domain/tokens.ts for the rules.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type SeatInfo = {
  studentId: string;
  studentCode: string;
  fullName: string;
  admissionDate: DateString;
  buildingId: string;
  buildingCode: string;
  roomNumber: string;
  seatLabel: string;
  rentPaisa: Paisa;
  /** First day the student ever had a seat (where meals start for a student without tokens). */
  firstSeatDate: DateString;
};

/** Active students with their current seat. */
export async function loadSeatInfo(tx: DbOrTx, orgId: string, studentIds?: string[]): Promise<SeatInfo[]> {
  const where = [eq(seatAssignments.orgId, orgId), isNull(seatAssignments.endDate), eq(students.status, "active")];
  if (studentIds)
    where.push(
      inArray(seatAssignments.studentId, studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"]),
    );
  const rows = await tx
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      admissionDate: students.admissionDate,
      buildingId: seatAssignments.buildingId,
      buildingCode: buildings.code,
      roomNumber: rooms.number,
      seatLabel: seats.label,
      rentPaisa: seatAssignments.rentPaisa,
      seatStart: seatAssignments.startDate,
    })
    .from(seatAssignments)
    .innerJoin(students, eq(students.id, seatAssignments.studentId))
    .innerJoin(buildings, eq(buildings.id, seatAssignments.buildingId))
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(and(...where));
  if (rows.length === 0) return [];
  const firsts = await tx
    .select({ studentId: seatAssignments.studentId, first: min(seatAssignments.startDate) })
    .from(seatAssignments)
    .where(
      inArray(
        seatAssignments.studentId,
        rows.map((r) => r.studentId),
      ),
    )
    .groupBy(seatAssignments.studentId);
  const firstBy = new Map(firsts.map((f) => [f.studentId, f.first]));
  return rows.map(({ seatStart, ...r }) => ({ ...r, firstSeatDate: firstBy.get(r.studentId) ?? seatStart }));
}

type TokenRow = typeof tokens.$inferSelect;

/** Each student's newest token. */
export async function latestTokens(tx: DbOrTx, studentIds: string[]): Promise<Map<string, TokenRow>> {
  const map = new Map<string, TokenRow>();
  if (studentIds.length === 0) return map;
  const rows = await tx.select().from(tokens).where(inArray(tokens.studentId, studentIds)).orderBy(desc(tokens.period));
  for (const r of rows) if (!map.has(r.studentId)) map.set(r.studentId, r);
  return map;
}

/** Meal money billed on each token (deposit, and at admission the rest-of-month meals). */
export async function mealChargesOf(tx: DbOrTx, tokenIds: string[]): Promise<Map<string, Paisa>> {
  const map = new Map<string, Paisa>();
  if (tokenIds.length === 0) return map;
  const rows = await tx
    .select({
      tokenId: ledgerEntries.sourceId,
      total: sql<string>`coalesce(sum(${ledgerEntries.debitPaisa} - ${ledgerEntries.creditPaisa}), 0)`.mapWith(Number),
    })
    .from(ledgerEntries)
    .where(
      and(
        inArray(ledgerEntries.sourceId, tokenIds),
        eq(ledgerEntries.head, "meal"),
        inArray(ledgerEntries.sourceType, ["token", "admission"]),
      ),
    )
    .groupBy(ledgerEntries.sourceId);
  for (const r of rows) if (r.tokenId) map.set(r.tokenId, r.total);
  return map;
}

async function ledgerLinesOf(tx: DbOrTx, orgId: string, studentIds: string[]): Promise<Map<string, LedgerLine[]>> {
  const map = new Map<string, LedgerLine[]>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({
      studentId: ledgerEntries.studentId,
      head: ledgerEntries.head,
      period: ledgerEntries.period,
      debitPaisa: ledgerEntries.debitPaisa,
      creditPaisa: ledgerEntries.creditPaisa,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orgId, orgId), inArray(ledgerEntries.studentId, studentIds)));
  for (const r of rows) map.set(r.studentId, [...(map.get(r.studentId) ?? []), r]);
  return map;
}

// ---------------------------------------------------------------------------
// Meals over a range of days (may cross months: each month uses its own rates)
// ---------------------------------------------------------------------------

export type MealWindow = {
  from: DateString | null;
  to: DateString | null;
  breakfast: number;
  lunch: number;
  dinner: number;
  costPaisa: Paisa;
  depositPaisa: Paisa;
  /** cost − deposit: + the student pays more, − money back. */
  differencePaisa: Paisa;
};

/**
 * Meal cost of [from, to] for many students at once (grouped by identical ranges).
 * Missing rates are reported in `blockers`.
 */
export async function mealCostsFor(
  tx: DbOrTx,
  orgId: string,
  ranges: { studentId: string; from: DateString; to: DateString }[],
  blockers: Set<string>,
): Promise<Map<string, { breakfast: number; lunch: number; dinner: number; costPaisa: Paisa }>> {
  const result = new Map<string, { breakfast: number; lunch: number; dinner: number; costPaisa: Paisa }>();
  const groups = new Map<string, string[]>();
  for (const r of ranges) {
    result.set(r.studentId, { breakfast: 0, lunch: 0, dinner: 0, costPaisa: 0 });
    if (r.from > r.to) continue;
    const k = `${r.from}|${r.to}`;
    groups.set(k, [...(groups.get(k) ?? []), r.studentId]);
  }
  const ratesCache = new Map<Period, Awaited<ReturnType<typeof getEffectiveRates>>>();
  for (const [k, ids] of groups) {
    const [from, to] = k.split("|");
    for (let p = periodOf(from); p <= periodOf(to); p = addMonths(p, 1)) {
      if (!ratesCache.has(p)) ratesCache.set(p, await getEffectiveRates(tx, orgId, p));
      const rates = ratesCache.get(p);
      if (!rates) {
        blockers.add(`Set the meal rates for ${formatPeriod(p)} in Settings first.`);
        continue;
      }
      const rows = await computeMealCounts(tx, orgId, p, null, {
        studentIds: ids,
        from: from > periodStart(p) ? from : periodStart(p),
        until: to < periodEnd(p) ? to : periodEnd(p),
      });
      for (const c of rows) {
        const acc = result.get(c.studentId);
        if (!acc) continue;
        acc.breakfast += c.breakfast;
        acc.lunch += c.lunch;
        acc.dinner += c.dinner;
        acc.costPaisa += mealCost(c, rates.rates);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Planning a monthly token (the 1st, or early)
// ---------------------------------------------------------------------------

export type TokenPlan = {
  student: SeatInfo;
  period: Period;
  code: string;
  early: boolean;
  lines: TokenLineDraft[];
  currentTotalPaisa: Paisa;
  dueTotalPaisa: Paisa;
  totalPaisa: Paisa;
  meal: MealWindow | null;
  mealFrom: DateString | null;
  mealTo: DateString;
  /** The month the pre-meal amount is booked in (the previous token's month). */
  mealPostPeriod: Period;
  transfers: { fromHead: LedgerHead; toHead: LedgerHead; amountPaisa: Paisa }[];
};

/** "Sep 2026, Oct 2026": the months a head is still unpaid for. */
function duePeriodsDetail(lines: LedgerLine[], head: LedgerHead): string | null {
  const months = [
    ...new Set(
      openDues(lines)
        .filter((d) => d.head === head)
        .map((d) => d.period),
    ),
  ].sort();
  return months.length ? months.map(shortMonth).join(", ") : null;
}

/** "25 – 30 Sep" when the only rent due is the rest of the admission month, else the months. */
function rentDueDetail(lines: LedgerLine[], admissionDate: DateString): string | null {
  const months = [
    ...new Set(
      openDues(lines)
        .filter((d) => d.head === "rent")
        .map((d) => d.period),
    ),
  ].sort();
  if (months.length === 0) return null;
  const admissionMonth = periodOf(admissionDate);
  return months
    .map((m) =>
      m === admissionMonth && admissionDate.slice(8) !== "01" ? dayRange(admissionDate, periodEnd(m)) : shortMonth(m),
    )
    .join(", ");
}

export async function planTokens(
  tx: DbOrTx,
  orgId: string,
  period: Period,
  list: SeatInfo[],
  today: DateString,
  early: boolean,
): Promise<{ plans: TokenPlan[]; blockers: string[]; skipped: number }> {
  const blockers = new Set<string>();
  const rates = await getEffectiveRates(tx, orgId, period);
  if (!rates) blockers.add(`Set the rates for ${formatPeriod(period)} in Settings first.`);

  const ids = list.map((s) => s.studentId);
  const latest = await latestTokens(tx, ids);
  const todo = list.filter((s) => {
    const prev = latest.get(s.studentId);
    return !prev || prev.period < period;
  });
  const charges = await mealChargesOf(
    tx,
    todo.map((s) => latest.get(s.studentId)?.id).filter((x): x is string => !!x),
  );
  const cutoff = mealCutoff(period, today);
  const windows = todo.map((s) => {
    const prev = latest.get(s.studentId);
    const from = prev?.mealTo ? shiftDate(prev.mealTo, 1) : s.firstSeatDate;
    return { studentId: s.studentId, from, to: cutoff, deposit: prev ? (charges.get(prev.id) ?? 0) : 0, prev };
  });
  const costs = await mealCostsFor(tx, orgId, windows, blockers);
  const ledgerBy = await ledgerLinesOf(
    tx,
    orgId,
    todo.map((s) => s.studentId),
  );

  const plans: TokenPlan[] = [];
  if (rates) {
    for (const s of todo) {
      const w = windows.find((x) => x.studentId === s.studentId)!;
      const c = costs.get(s.studentId)!;
      const hasDays = w.from <= w.to;
      const meal: MealWindow | null =
        hasDays || w.deposit !== 0
          ? {
              from: hasDays ? w.from : null,
              to: hasDays ? w.to : null,
              ...c,
              depositPaisa: w.deposit,
              differencePaisa: c.costPaisa - w.deposit,
            }
          : null;
      const lines = ledgerBy.get(s.studentId) ?? [];
      const balances = balancesByHead(lines);
      // Meal money still unpaid from older tokens ("Meal due") is kept apart from this pre meal.
      const oldMealPaisa = balances.meal ?? 0;
      const due = dueLines({ ...balances, meal: 0 }, { rent: rentDueDetail(lines, s.admissionDate) });
      const mealDue: TokenLineDraft[] = [];
      if (meal && meal.differencePaisa !== 0) {
        mealDue.push({
          section: "due",
          head: "meal",
          label: "Pre meal",
          detail: meal.from && meal.to ? dayRange(meal.from, meal.to) : null,
          amountPaisa: meal.differencePaisa,
          post: false,
        });
        balances.meal = oldMealPaisa + meal.differencePaisa;
        if (balances.meal === 0) delete balances.meal;
      }
      if (oldMealPaisa !== 0) {
        mealDue.push({
          section: "due",
          head: "meal",
          label: oldMealPaisa > 0 ? "Meal due" : "Meal extra paid",
          detail: duePeriodsDetail(lines, "meal"),
          amountPaisa: oldMealPaisa,
          post: false,
        });
      }
      const afterRent = due.findIndex((l) => l.head !== "rent");
      due.splice(afterRent === -1 ? due.length : afterRent, 0, ...mealDue);
      const current = monthLines({ period, rentPaisa: s.rentPaisa, mealDepositPaisa: rates.rates.mealDepositPaisa });
      const after: Partial<Record<LedgerHead, Paisa>> = { ...balances };
      for (const l of current) after[l.head] = (after[l.head] ?? 0) + l.amountPaisa;
      plans.push({
        student: s,
        period,
        code: tokenCode({
          period,
          buildingCode: s.buildingCode,
          roomNumber: s.roomNumber,
          seatLabel: s.seatLabel,
          studentCode: s.studentCode,
        }),
        early,
        lines: [...current, ...due],
        currentTotalPaisa: totalOf(current),
        dueTotalPaisa: totalOf(due),
        totalPaisa: totalOf(current) + totalOf(due),
        meal,
        mealFrom: hasDays ? w.from : null,
        mealTo: w.to >= w.from || !w.prev?.mealTo ? w.to : w.prev.mealTo,
        mealPostPeriod: w.prev?.period ?? previousPeriod(period),
        transfers: netCredits(after, DEFAULT_ALLOCATION_ORDER),
      });
    }
  }
  plans.sort(
    (a, b) =>
      a.student.buildingCode.localeCompare(b.student.buildingCode, "en", { numeric: true }) ||
      a.student.roomNumber.localeCompare(b.student.roomNumber, "en", { numeric: true }) ||
      a.student.seatLabel.localeCompare(b.student.seatLabel),
  );
  return { plans, blockers: [...blockers], skipped: list.length - todo.length };
}

// ---------------------------------------------------------------------------
// Writing a token
// ---------------------------------------------------------------------------

async function insertToken(
  tx: Transaction,
  orgId: string,
  input: {
    student: SeatInfo;
    period: Period;
    code: string;
    kind: "monthly" | "admission";
    early: boolean;
    lines: TokenLineDraft[];
    mealFrom: DateString | null;
    mealTo: DateString | null;
    actorMembershipId: string | null;
  },
): Promise<string> {
  const current = input.lines.filter((l) => l.section === "current");
  const due = input.lines.filter((l) => l.section === "due");
  const [token] = await tx
    .insert(tokens)
    .values({
      orgId,
      studentId: input.student.studentId,
      buildingId: input.student.buildingId,
      period: input.period,
      code: input.code,
      kind: input.kind,
      early: input.early,
      mealFrom: input.mealFrom,
      mealTo: input.mealTo,
      seatText: `${input.student.buildingCode} · ${input.student.roomNumber}-${input.student.seatLabel}`,
      rentPaisa: input.student.rentPaisa,
      currentTotalPaisa: totalOf(current),
      previousTotalPaisa: totalOf(due),
      totalPaisa: totalOf(input.lines),
      createdBy: input.actorMembershipId,
    })
    .returning({ id: tokens.id });
  if (input.lines.length) {
    await tx.insert(tokenLines).values(
      [...current, ...due].map((l, i) => ({
        orgId,
        tokenId: token.id,
        kind: l.section === "current" ? ("current" as const) : ("previous" as const),
        head: l.head,
        label: l.label,
        detail: l.detail,
        amountPaisa: l.amountPaisa,
        sort: l.section === "current" ? i : 100 + i,
      })),
    );
  }
  return token.id;
}

/** Save a planned monthly token: pre-meal settlement, this month's charges, credits used. */
export async function commitTokenPlan(
  tx: Transaction,
  orgId: string,
  plan: TokenPlan,
  actorMembershipId: string | null,
  entryDate: DateString,
): Promise<string> {
  const tokenId = await insertToken(tx, orgId, {
    student: plan.student,
    period: plan.period,
    code: plan.code,
    kind: "monthly",
    early: plan.early,
    lines: plan.lines,
    mealFrom: plan.mealFrom,
    mealTo: plan.mealTo,
    actorMembershipId,
  });
  const base = {
    orgId,
    studentId: plan.student.studentId,
    buildingId: plan.student.buildingId,
    entryDate,
    createdBy: actorMembershipId,
  };
  const ledger: NewLedgerEntry[] = [];

  if (plan.meal) {
    const [row] = await tx
      .insert(mealSettlements)
      .values({
        orgId,
        studentId: plan.student.studentId,
        buildingId: plan.student.buildingId,
        period: plan.period,
        tokenId,
        fromDate: plan.meal.from,
        toDate: plan.meal.to,
        breakfast: plan.meal.breakfast,
        lunch: plan.meal.lunch,
        dinner: plan.meal.dinner,
        costPaisa: plan.meal.costPaisa,
        depositPaisa: plan.meal.depositPaisa,
        differencePaisa: plan.meal.differencePaisa,
      })
      .returning({ id: mealSettlements.id });
    ledger.push({
      ...base,
      period: plan.mealPostPeriod,
      head: "meal",
      amountPaisa: plan.meal.differencePaisa,
      sourceType: "meal_settlement",
      sourceId: row.id,
      description: `Pre meal ${plan.meal.from && plan.meal.to ? dayRange(plan.meal.from, plan.meal.to) : ""}`.trim(),
    });
  }
  for (const l of plan.lines.filter((x) => x.post)) {
    ledger.push({
      ...base,
      period: plan.period,
      head: l.head,
      amountPaisa: l.amountPaisa,
      sourceType: "token",
      sourceId: tokenId,
      description: `${l.label} ${l.detail ?? ""}`.trim(),
    });
  }
  for (const t of plan.transfers) {
    ledger.push({
      ...base,
      period: plan.period,
      head: t.toHead,
      amountPaisa: -t.amountPaisa,
      sourceType: "netting",
      sourceId: tokenId,
      description: `Paid from ${t.fromHead}`,
    });
    ledger.push({
      ...base,
      period: plan.period,
      head: t.fromHead,
      amountPaisa: t.amountPaisa,
      sourceType: "netting",
      sourceId: tokenId,
      description: `Used for ${t.toHead}`,
    });
  }
  await postLedger(tx, ledger);
  return tokenId;
}

// ---------------------------------------------------------------------------
// Admission token
// ---------------------------------------------------------------------------

export type AdmissionToken = {
  tokenId: string;
  code: string;
  period: Period;
  lines: TokenLineDraft[];
  totalPaisa: Paisa;
};

/** Called inside the admission transaction, after the seat assignment exists. */
export async function createAdmissionToken(
  tx: Transaction,
  orgId: string,
  studentId: string,
  admissionDate: DateString,
  actorMembershipId: string,
): Promise<AdmissionToken> {
  const [student] = await loadSeatInfo(tx, orgId, [studentId]);
  if (!student) throw new AppError("VALIDATION", "The student has no seat.");
  const admissionMonth = periodOf(admissionDate);
  const tokenMonth = addMonths(admissionMonth, 1);
  const [ratesA, ratesT] = await Promise.all([
    getEffectiveRates(tx, orgId, admissionMonth),
    getEffectiveRates(tx, orgId, tokenMonth),
  ]);
  if (!ratesA || !ratesT) {
    throw new AppError("VALIDATION", `Set the rates for ${formatPeriod(admissionMonth)} in Settings first.`);
  }
  const blockers = new Set<string>();
  const meals = await mealCostsFor(
    tx,
    orgId,
    [{ studentId, from: admissionDate, to: periodEnd(admissionMonth) }],
    blockers,
  );
  const drafts = admissionDrafts({
    admissionDate,
    rentPaisa: student.rentPaisa,
    restOfMonthMealsPaisa: meals.get(studentId)?.costPaisa ?? 0,
    mealDepositPaisa: ratesT.rates.mealDepositPaisa,
    advanceMonths: ratesT.rates.advanceMonths,
    serviceChargePaisa: ratesT.rates.serviceChargePaisa,
    rule: ratesA.rates.midMonthRule,
  });
  const code = tokenCode({
    period: drafts.period,
    buildingCode: student.buildingCode,
    roomNumber: student.roomNumber,
    seatLabel: student.seatLabel,
    studentCode: student.studentCode,
  });
  const tokenId = await insertToken(tx, orgId, {
    student,
    period: drafts.period,
    code,
    kind: "admission",
    early: false,
    lines: drafts.lines,
    mealFrom: null,
    // The admission token settles no meals; the next token starts on the admission date.
    mealTo: shiftDate(admissionDate, -1),
    actorMembershipId,
  });
  await postLedger(
    tx,
    drafts.lines.map((l) => ({
      orgId,
      studentId,
      buildingId: student.buildingId,
      period: l.section === "current" ? drafts.period : admissionMonth,
      entryDate: admissionDate,
      head: l.head,
      amountPaisa: l.amountPaisa,
      sourceType: "admission" as const,
      sourceId: tokenId,
      description: `${l.label} ${l.detail ?? ""}`.trim(),
      createdBy: actorMembershipId,
    })),
  );
  return { tokenId, code, period: drafts.period, lines: drafts.lines, totalPaisa: totalOf(drafts.lines) };
}

// ---------------------------------------------------------------------------
// The monthly run (the 1st at 00:05, or by the admin)
// ---------------------------------------------------------------------------

export type TokenRunPlan = {
  tokenPeriod: Period;
  closePeriod: Period;
  alreadyClosed: boolean;
  tokens: TokenPlan[];
  /** Students who already have this month's token (made early or at admission). */
  tokensAlreadyMade: number;
  blockers: string[];
};

export async function planTokenRun(
  tx: DbOrTx,
  orgId: string,
  tokenPeriod: Period,
  today: DateString,
): Promise<TokenRunPlan> {
  const closePeriod = previousPeriod(tokenPeriod);
  const blockers: string[] = [];
  if (tokenPeriod > periodOf(today)) {
    blockers.push(
      `Tokens for ${formatPeriod(tokenPeriod)} are made on the 1st. Use "Make next month's token" for one student.`,
    );
  }
  const [closeRow] = await tx
    .select({ closedAt: billingPeriods.closedAt })
    .from(billingPeriods)
    .where(and(eq(billingPeriods.orgId, orgId), eq(billingPeriods.period, closePeriod)))
    .limit(1);
  const firstDay = periodStart(tokenPeriod);
  const list = (await loadSeatInfo(tx, orgId)).filter((s) => s.firstSeatDate <= firstDay);
  const planned = await planTokens(tx, orgId, tokenPeriod, list, today, false);
  return {
    tokenPeriod,
    closePeriod,
    alreadyClosed: !!closeRow?.closedAt,
    tokens: planned.plans,
    tokensAlreadyMade: planned.skipped,
    blockers: [...blockers, ...planned.blockers],
  };
}

export type TokenRunResult = { tokenPeriod: Period; closedPeriod: Period | null; tokensMade: number };

export async function runTokenRun(
  orgId: string,
  tokenPeriod: Period,
  actorMembershipId: string | null,
  today: DateString,
): Promise<TokenRunResult> {
  const closePeriod = previousPeriod(tokenPeriod);
  return db().transaction(async (tx) => {
    // Lock both month rows so two runs (cron + admin click) cannot overlap.
    await tx
      .insert(billingPeriods)
      .values([
        { orgId, period: closePeriod },
        { orgId, period: tokenPeriod },
      ])
      .onConflictDoNothing();
    await tx
      .select({ id: billingPeriods.id })
      .from(billingPeriods)
      .where(and(eq(billingPeriods.orgId, orgId), inArray(billingPeriods.period, [closePeriod, tokenPeriod])))
      .for("update");

    const plan = await planTokenRun(tx, orgId, tokenPeriod, today);
    if (plan.blockers.length) throw new AppError("VALIDATION", plan.blockers.join(" "));

    for (const t of plan.tokens) await commitTokenPlan(tx, orgId, t, actorMembershipId, today);

    if (!plan.alreadyClosed) {
      await tx
        .update(billingPeriods)
        .set({ closedAt: new Date(), closedBy: actorMembershipId })
        .where(and(eq(billingPeriods.orgId, orgId), eq(billingPeriods.period, closePeriod)));
    }
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(tokens)
      .where(and(eq(tokens.orgId, orgId), eq(tokens.period, tokenPeriod)));
    await tx
      .update(billingPeriods)
      .set({ tokensGeneratedAt: new Date(), tokensCount: count })
      .where(and(eq(billingPeriods.orgId, orgId), eq(billingPeriods.period, tokenPeriod)));

    await writeAudit(tx, {
      orgId,
      actorMembershipId,
      action: "billing.token_run",
      entityType: "billing_period",
      entityId: tokenPeriod,
      after: {
        closedPeriod: plan.alreadyClosed ? null : closePeriod,
        tokensMade: plan.tokens.length,
        byCron: actorMembershipId === null,
      },
    });
    return { tokenPeriod, closedPeriod: plan.alreadyClosed ? null : closePeriod, tokensMade: plan.tokens.length };
  });
}

// ---------------------------------------------------------------------------
// Early token for one student (admin)
// ---------------------------------------------------------------------------

export async function planEarlyToken(
  tx: DbOrTx,
  orgId: string,
  studentId: string,
  today: DateString,
): Promise<{ plan: TokenPlan | null; error: string | null }> {
  const thisMonth = periodOf(today);
  const next = addMonths(thisMonth, 1);
  const [student] = await loadSeatInfo(tx, orgId, [studentId]);
  if (!student) return { plan: null, error: "This student has no current seat." };
  const latest = (await latestTokens(tx, [studentId])).get(studentId);
  if (latest && latest.period >= next) {
    return { plan: null, error: `The ${formatPeriod(latest.period)} token is already made (${latest.code}).` };
  }
  if (!latest || latest.period < thisMonth) {
    return {
      plan: null,
      error: `Make the ${formatPeriod(thisMonth)} token first (Tokens → run for ${formatPeriod(thisMonth)}).`,
    };
  }
  const { plans, blockers } = await planTokens(tx, orgId, next, [student], today, true);
  if (blockers.length) return { plan: null, error: blockers.join(" ") };
  return { plan: plans[0] ?? null, error: plans[0] ? null : "Nothing to make." };
}

export async function makeEarlyToken(
  orgId: string,
  studentId: string,
  actorMembershipId: string,
  today: DateString,
): Promise<{ code: string; period: Period }> {
  return db().transaction(async (tx) => {
    // One at a time per student.
    await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)).for("update");
    const { plan, error } = await planEarlyToken(tx, orgId, studentId, today);
    if (!plan) throw new AppError("VALIDATION", error ?? "Cannot make the token.");
    await commitTokenPlan(tx, orgId, plan, actorMembershipId, today);
    await writeAudit(tx, {
      orgId,
      actorMembershipId,
      action: "token.early",
      entityType: "student",
      entityId: studentId,
      after: { code: plan.code, period: plan.period, meal: plan.meal, totalPaisa: plan.totalPaisa },
    });
    return { code: plan.code, period: plan.period };
  });
}

// ---------------------------------------------------------------------------
// Meals already on a token cannot change any more
// ---------------------------------------------------------------------------

/** For each student, the last day whose meals are on a token (null = none). */
export async function mealLockDates(tx: DbOrTx, studentIds: string[]): Promise<Map<string, DateString>> {
  const map = new Map<string, DateString>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({ studentId: tokens.studentId, lockTo: sql<string>`max(${tokens.mealTo})` })
    .from(tokens)
    .where(and(inArray(tokens.studentId, studentIds), isNotNull(tokens.mealTo)))
    .groupBy(tokens.studentId);
  for (const r of rows) if (r.lockTo) map.set(r.studentId, String(r.lockTo).slice(0, 10));
  return map;
}

/** Is any active student's meal day `date` already on a token? (Used before adding a holiday.) */
export async function anyMealLockedOn(tx: DbOrTx, orgId: string, date: DateString): Promise<boolean> {
  const [row] = await tx
    .select({ id: tokens.id })
    .from(tokens)
    .innerJoin(students, eq(students.id, tokens.studentId))
    .where(and(eq(tokens.orgId, orgId), eq(students.status, "active"), lte(sql`${date}::date`, tokens.mealTo)))
    .limit(1);
  return !!row;
}
