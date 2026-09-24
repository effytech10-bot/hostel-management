import "server-only";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { addMonths, dhakaDate, formatPeriod, periodEnd, periodOf, periodStart, type DateString } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import type { LeaveInput, RefundInput } from "@/lib/validation/leave";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db, type DbOrTx, type Transaction } from "@/server/db/client";
import { mealSettlements, paymentAccounts, refunds, seatAssignments, students } from "@/server/db/schema";
import {
  balancesByHead,
  LEDGER_HEADS,
  mealSettlement,
  netCredits,
  type LedgerHead,
  type MidMonthRule,
} from "@/server/domain/billing";
import { shiftDate } from "@/server/domain/meals";
import { unusedDaysCredit } from "@/server/domain/stay";
import { AppError } from "@/server/errors";
import { postLedger, studentLedger, type NewLedgerEntry } from "./ledger";
import { computeMealCounts } from "./meals";
import { assertPeriodOpen, isPeriodLocked } from "./periods";
import { getEffectiveRates } from "./rates";

export type LeaveStatement = {
  studentId: string;
  fullName: string;
  lastDay: DateString;
  period: string;
  rule: MidMonthRule;
  meal: {
    breakfast: number;
    lunch: number;
    dinner: number;
    costPaisa: Paisa;
    depositPaisa: Paisa;
    differencePaisa: Paisa;
  } | null;
  unusedDays: number;
  rentBackPaisa: Paisa;
  baburchiBackPaisa: Paisa;
  advanceChargedPaisa: Paisa;
  advanceHeldPaisa: Paisa;
  balanceBeforePaisa: Paisa;
  /** + the student still has to pay, − the hostel has to give money back. */
  finalBalancePaisa: Paisa;
};

type Plan = {
  statement: LeaveStatement;
  entries: NewLedgerEntry[];
  settlementRow: typeof mealSettlements.$inferInsert | null;
  assignmentId: string;
};

async function planLeave(tx: DbOrTx, actor: SessionUser, input: LeaveInput, lock: boolean): Promise<Plan> {
  assertRole(actor, "admin");
  const query = tx
    .select()
    .from(students)
    .where(and(eq(students.id, input.studentId), eq(students.orgId, actor.orgId)))
    .limit(1);
  const [student] = lock ? await query.for("update") : await query;
  if (!student) throw new AppError("NOT_FOUND", "Student not found.");
  if (student.status !== "active") throw new AppError("VALIDATION", "This student has already left.");

  const lastDay = input.lastDay;
  if (lastDay > dhakaDate()) throw new AppError("VALIDATION", "The last day cannot be in the future.");
  await assertPeriodOpen(tx, actor.orgId, lastDay);

  const [current] = await tx
    .select()
    .from(seatAssignments)
    .where(and(eq(seatAssignments.studentId, student.id), isNull(seatAssignments.endDate)))
    .limit(1);
  if (!current) throw new AppError("VALIDATION", "This student has no current seat.");
  if (lastDay < current.startDate) {
    throw new AppError("VALIDATION", `The last day cannot be before the current seat started (${current.startDate}).`);
  }

  const period = periodOf(lastDay);
  // The month before must be settled first, or its meals would be missing from the final statement.
  const previous = addMonths(period, -1);
  if (!(await isPeriodLocked(tx, actor.orgId, previous))) {
    const [hadSeat] = await tx
      .select({ id: seatAssignments.id })
      .from(seatAssignments)
      .where(
        and(
          eq(seatAssignments.studentId, student.id),
          lte(seatAssignments.startDate, periodEnd(previous)),
          or(isNull(seatAssignments.endDate), gt(seatAssignments.endDate, periodStart(previous))),
        ),
      )
      .limit(1);
    if (hadSeat) {
      throw new AppError(
        "VALIDATION",
        `Close ${formatPeriod(previous)} first (Tokens → Month-end), then record the leave.`,
      );
    }
  }

  const effective = await getEffectiveRates(tx, actor.orgId, period);
  if (!effective) throw new AppError("VALIDATION", `Set the rates for ${formatPeriod(period)} in Settings first.`);
  const rule = effective.rates.midMonthRule;

  const lines = await studentLedger(tx, actor.orgId, student.id);
  const inPeriod = (head: LedgerHead) =>
    lines
      .filter(
        (l) => l.period === period && l.head === head && (l.sourceType === "token" || l.sourceType === "admission"),
      )
      .reduce((s, l) => s + l.debitPaisa, 0);

  const base = {
    orgId: actor.orgId,
    studentId: student.id,
    buildingId: current.buildingId,
    period,
    entryDate: lastDay,
    createdBy: actor.membershipId,
  };
  const entries: NewLedgerEntry[] = [];

  // 1. Meals of the last month, up to the last day
  let meal: LeaveStatement["meal"] = null;
  let settlementRow: Plan["settlementRow"] = null;
  const [alreadySettled] = await tx
    .select({ id: mealSettlements.id })
    .from(mealSettlements)
    .where(and(eq(mealSettlements.studentId, student.id), eq(mealSettlements.period, period)))
    .limit(1);
  if (!alreadySettled) {
    const [counts] = await computeMealCounts(tx, actor.orgId, period, null, {
      studentIds: [student.id],
      until: lastDay,
    });
    const c = counts ?? { breakfast: 0, lunch: 0, dinner: 0 };
    const s = mealSettlement({ counts: c, depositPaisa: inPeriod("meal"), rates: effective.rates });
    meal = {
      breakfast: c.breakfast,
      lunch: c.lunch,
      dinner: c.dinner,
      costPaisa: s.costPaisa,
      depositPaisa: s.depositPaisa,
      differencePaisa: s.differencePaisa,
    };
    settlementRow = {
      orgId: actor.orgId,
      studentId: student.id,
      buildingId: current.buildingId,
      period,
      breakfast: c.breakfast,
      lunch: c.lunch,
      dinner: c.dinner,
      costPaisa: s.costPaisa,
      depositPaisa: s.depositPaisa,
      differencePaisa: s.differencePaisa,
    };
    entries.push({
      ...base,
      head: "meal",
      amountPaisa: s.differencePaisa,
      sourceType: "meal_settlement",
      description: `Meals until ${lastDay} (leaving)`,
    });
  }

  // 2. Unused days of this month's rent and baburchi
  const back = unusedDaysCredit({
    lastDay,
    chargedRentPaisa: inPeriod("rent"),
    chargedBaburchiPaisa: inPeriod("baburchi"),
    rule,
  });
  entries.push({
    ...base,
    head: "rent",
    amountPaisa: -back.rentPaisa,
    sourceType: "leave",
    description: `${back.unusedDays} unused day(s) of rent`,
  });
  entries.push({
    ...base,
    head: "baburchi",
    amountPaisa: -back.baburchiPaisa,
    sourceType: "leave",
    description: `${back.unusedDays} unused day(s) of baburchi`,
  });

  // 3. Advance: cancel the advance charge. What was paid becomes the student's money and pays their dues.
  const advanceCharged = lines.filter((l) => l.head === "advance").reduce((s, l) => s + l.debitPaisa, 0);
  const advanceBalance = lines
    .filter((l) => l.head === "advance")
    .reduce((s, l) => s + l.debitPaisa - l.creditPaisa, 0);
  entries.push({
    ...base,
    head: "advance",
    amountPaisa: -advanceCharged,
    sourceType: "leave",
    description: "Advance returned on leaving",
  });

  // 4. Use every credit against every due
  const before = balancesByHead(lines);
  const after: Partial<Record<LedgerHead, Paisa>> = { ...before };
  for (const e of entries) after[e.head] = (after[e.head] ?? 0) + e.amountPaisa;
  for (const t of netCredits(after, LEDGER_HEADS)) {
    entries.push({
      ...base,
      head: t.toHead,
      amountPaisa: -t.amountPaisa,
      sourceType: "netting",
      description: `Paid from ${t.fromHead}`,
    });
    entries.push({
      ...base,
      head: t.fromHead,
      amountPaisa: t.amountPaisa,
      sourceType: "netting",
      description: `Used for ${t.toHead}`,
    });
  }

  const sum = (o: Partial<Record<LedgerHead, Paisa>>) => Object.values(o).reduce((s, v) => s + (v ?? 0), 0);
  const finalBalance = sum(before) + entries.reduce((s, e) => s + e.amountPaisa, 0);

  return {
    assignmentId: current.id,
    settlementRow,
    entries,
    statement: {
      studentId: student.id,
      fullName: student.fullName,
      lastDay,
      period,
      rule,
      meal,
      unusedDays: back.unusedDays,
      rentBackPaisa: back.rentPaisa,
      baburchiBackPaisa: back.baburchiPaisa,
      advanceChargedPaisa: advanceCharged,
      advanceHeldPaisa: Math.max(0, advanceCharged - Math.max(0, advanceBalance)),
      balanceBeforePaisa: sum(before),
      finalBalancePaisa: finalBalance,
    },
  };
}

/** What will happen if the student leaves on `lastDay`. Changes nothing. */
export async function previewLeave(actor: SessionUser, input: LeaveInput): Promise<LeaveStatement> {
  return (await planLeave(db(), actor, input, false)).statement;
}

/** Record the leave: final meal settlement, unused days back, advance returned, seat freed, status "left". */
export async function confirmLeave(actor: SessionUser, input: LeaveInput): Promise<LeaveStatement> {
  return db().transaction(async (tx) => {
    const plan = await planLeave(tx, actor, input, true);
    const { statement } = plan;

    if (plan.settlementRow) {
      const [row] = await tx.insert(mealSettlements).values(plan.settlementRow).returning({ id: mealSettlements.id });
      for (const e of plan.entries) if (e.sourceType === "meal_settlement") e.sourceId = row.id;
    }
    await postLedger(tx, plan.entries);

    await tx
      .update(seatAssignments)
      .set({ endDate: shiftDate(statement.lastDay, 1), endReason: "left" })
      .where(eq(seatAssignments.id, plan.assignmentId));
    await tx
      .update(students)
      .set({ status: "left", leftDate: statement.lastDay })
      .where(eq(students.id, statement.studentId));

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "student.leave",
      entityType: "student",
      entityId: statement.studentId,
      after: statement,
    });

    if (input.refundAccountId && statement.finalBalancePaisa < 0) {
      await refundInTx(tx, actor, {
        studentId: statement.studentId,
        amount: -statement.finalBalancePaisa,
        accountId: input.refundAccountId,
        note: "Final settlement on leaving",
      });
    }
    return statement;
  });
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

async function refundInTx(tx: Transaction, actor: SessionUser, input: RefundInput): Promise<string> {
  const [student] = await tx
    .select({ id: students.id, buildingId: students.buildingId })
    .from(students)
    .where(and(eq(students.id, input.studentId), eq(students.orgId, actor.orgId)))
    .limit(1);
  if (!student) throw new AppError("NOT_FOUND", "Student not found.");

  const [account] = await tx
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, input.accountId), eq(paymentAccounts.orgId, actor.orgId)))
    .limit(1);
  if (!account) throw new AppError("VALIDATION", "Choose the account the money is paid from.");

  const today = dhakaDate();
  await assertPeriodOpen(tx, actor.orgId, today);

  const balances = balancesByHead(await studentLedger(tx, actor.orgId, student.id));
  const credit = -Object.values(balances).reduce((s, v) => s + (v ?? 0), 0);
  if (credit < input.amount) {
    throw new AppError("VALIDATION", `The student only has ৳${Math.max(0, credit) / 100} to get back.`);
  }

  const [refund] = await tx
    .insert(refunds)
    .values({
      orgId: actor.orgId,
      studentId: student.id,
      buildingId: student.buildingId,
      amountPaisa: input.amount,
      accountId: account.id,
      paidDate: today,
      note: input.note,
      createdBy: actor.membershipId,
    })
    .returning({ id: refunds.id });

  // Take the refund out of the heads that hold the student's money: plain credit first, then the rest.
  let left = input.amount;
  const entries: NewLedgerEntry[] = [];
  for (const head of ["credit", ...LEDGER_HEADS.filter((h) => h !== "credit")] as LedgerHead[]) {
    const available = -(balances[head] ?? 0);
    if (left === 0 || available <= 0) continue;
    const take = Math.min(left, available);
    entries.push({
      orgId: actor.orgId,
      studentId: student.id,
      buildingId: student.buildingId,
      period: periodOf(today),
      entryDate: today,
      head,
      amountPaisa: take,
      sourceType: "refund",
      sourceId: refund.id,
      description: `Refund paid from ${account.name}`,
      createdBy: actor.membershipId,
    });
    left -= take;
  }
  await postLedger(tx, entries);

  await writeAudit(tx, {
    orgId: actor.orgId,
    actorMembershipId: actor.membershipId,
    action: "refund.create",
    entityType: "refund",
    entityId: refund.id,
    after: { ...input, account: account.name },
  });
  return refund.id;
}

export async function recordRefund(actor: SessionUser, input: RefundInput): Promise<string> {
  assertRole(actor, "admin");
  return db().transaction((tx) => refundInTx(tx, actor, input));
}

export async function listStudentRefunds(orgId: string, studentId: string) {
  return db()
    .select({
      id: refunds.id,
      amountPaisa: refunds.amountPaisa,
      paidDate: refunds.paidDate,
      note: refunds.note,
      accountName: paymentAccounts.name,
    })
    .from(refunds)
    .innerJoin(paymentAccounts, eq(paymentAccounts.id, refunds.accountId))
    .where(and(eq(refunds.orgId, orgId), eq(refunds.studentId, studentId)))
    .orderBy(sql`${refunds.createdAt} desc`);
}

/** Advance the student has actually paid and the hostel is holding (0 after leaving). */
export function advanceHeld(
  lines: { head: LedgerHead; sourceType: string; debitPaisa: number; creditPaisa: number }[],
): Paisa {
  return Math.max(
    0,
    lines
      .filter((l) => l.head === "advance" && ["payment", "payment_void", "netting", "opening_payment"].includes(l.sourceType))
      .reduce((s, l) => s + l.creditPaisa - l.debitPaisa, 0),
  );
}
