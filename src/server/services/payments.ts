import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { addMonths, currentPeriod, dhakaDate, periodOf, periodStart, type DateString } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import type { AdjustmentInput, PaymentAccountInput, PaymentInput, VoidPaymentInput } from "@/lib/validation/payments";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { nextCounter } from "@/server/counters";
import { db, type Transaction } from "@/server/db/client";
import { isPgError, PG_UNIQUE_VIOLATION } from "@/server/db/errors";
import {
  buildings,
  ledgerEntries,
  memberships,
  paymentAccounts,
  type PaymentAccount,
  payments,
  rooms,
  seatAssignments,
  seats,
  students,
  type PaymentMethod,
} from "@/server/db/schema";
import { allocatePayment, type Allocation, type LedgerHead } from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { accessibleBuildingIds } from "./buildings";
import { postLedger, studentAccount } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { advanceHeld, listStudentRefunds } from "./leave";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatReceiptNo(n: number): string {
  return `R-${String(n).padStart(6, "0")}`;
}

/** Payments and adjustments can be dated from the 1st of last month up to today. */
export function paymentDateError(date: DateString, today = dhakaDate()): string | null {
  if (date > today) return "The payment date cannot be in the future.";
  const earliest = periodStart(addMonths(currentPeriod(), -1));
  if (date < earliest) return `The date cannot be before ${earliest}.`;
  return null;
}

async function loadStudentForMoney(tx: Transaction, actor: SessionUser, studentId: string) {
  const [student] = await tx
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.orgId, actor.orgId)))
    .for("update")
    .limit(1);
  if (!student) throw new AppError("NOT_FOUND", "Student not found.");
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && (!student.buildingId || !allowed.includes(student.buildingId))) {
    throw new AppError("FORBIDDEN", "This student is not in one of your buildings.");
  }
  return student;
}

// ---------------------------------------------------------------------------
// Payment accounts
// ---------------------------------------------------------------------------

export async function listPaymentAccounts(
  actor: SessionUser,
  opts: { includeInactive?: boolean } = {},
): Promise<PaymentAccount[]> {
  assertRole(actor, "admin", "cashier");
  let rows = await db()
    .select()
    .from(paymentAccounts)
    .where(eq(paymentAccounts.orgId, actor.orgId))
    .orderBy(asc(paymentAccounts.method), asc(paymentAccounts.name));
  if (rows.length === 0) {
    // First use: every hostel has a cash box.
    await db()
      .insert(paymentAccounts)
      .values({ orgId: actor.orgId, name: "Cash in hand", method: "cash" })
      .onConflictDoNothing();
    rows = await db().select().from(paymentAccounts).where(eq(paymentAccounts.orgId, actor.orgId));
  }
  return opts.includeInactive ? rows : rows.filter((r) => r.isActive);
}

export async function createPaymentAccount(actor: SessionUser, input: PaymentAccountInput): Promise<void> {
  assertRole(actor, "admin");
  try {
    await db().transaction(async (tx) => {
      const [row] = await tx
        .insert(paymentAccounts)
        .values({ orgId: actor.orgId, name: input.name, method: input.method, details: input.details })
        .returning();
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "payment_account.create",
        entityType: "payment_account",
        entityId: row.id,
        after: row,
      });
    });
  } catch (e) {
    if (isPgError(e, PG_UNIQUE_VIOLATION)) throw new AppError("CONFLICT", `"${input.name}" already exists.`);
    throw e;
  }
}

export async function togglePaymentAccount(actor: SessionUser, accountId: string): Promise<void> {
  assertRole(actor, "admin");
  await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.id, accountId), eq(paymentAccounts.orgId, actor.orgId)))
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Account not found.");
    await tx.update(paymentAccounts).set({ isActive: !row.isActive }).where(eq(paymentAccounts.id, row.id));
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: row.isActive ? "payment_account.disable" : "payment_account.enable",
      entityType: "payment_account",
      entityId: row.id,
    });
  });
}

// ---------------------------------------------------------------------------
// Student account (dues + history)
// ---------------------------------------------------------------------------

export async function getStudentMoney(actor: SessionUser, studentId: string) {
  assertRole(actor, "admin", "cashier", "student");
  const [student] = await db()
    .select({
      id: students.id,
      buildingId: students.buildingId,
      membershipId: students.membershipId,
    })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.orgId, actor.orgId)))
    .limit(1);
  if (!student) throw new AppError("NOT_FOUND", "Student not found.");
  if (actor.role === "student" && student.membershipId !== actor.membershipId) {
    throw new AppError("FORBIDDEN", "Not your account.");
  }
  const allowed = actor.role === "student" ? null : await accessibleBuildingIds(actor);
  if (allowed && (!student.buildingId || !allowed.includes(student.buildingId))) {
    throw new AppError("FORBIDDEN", "This student is not in one of your buildings.");
  }

  const [account, paymentRows, refundRows, [studentRow]] = await Promise.all([
    studentAccount(db(), actor.orgId, student.id),
    db()
      .select({
        id: payments.id,
        receiptNo: payments.receiptNo,
        amountPaisa: payments.amountPaisa,
        method: payments.method,
        paidDate: payments.paidDate,
        voidedAt: payments.voidedAt,
        accountName: paymentAccounts.name,
      })
      .from(payments)
      .innerJoin(paymentAccounts, eq(paymentAccounts.id, payments.accountId))
      .where(eq(payments.studentId, student.id))
      .orderBy(desc(payments.paidDate), desc(payments.createdAt))
      .limit(50),
    listStudentRefunds(actor.orgId, student.id),
    db().select({ status: students.status }).from(students).where(eq(students.id, student.id)),
  ]);
  return {
    ...account,
    payments: paymentRows,
    refunds: refundRows,
    advanceHeldPaisa: studentRow.status === "active" ? advanceHeld(account.lines) : 0,
  };
}

// ---------------------------------------------------------------------------
// Record a payment
// ---------------------------------------------------------------------------

export type RecordedPayment = { paymentId: string; receiptNo: string; duplicate: boolean };

export async function recordPayment(actor: SessionUser, input: PaymentInput): Promise<RecordedPayment> {
  assertRole(actor, "admin", "cashier");
  const dateError = paymentDateError(input.paidDate);
  if (dateError) throw new AppError("VALIDATION", dateError);

  // Same form submitted twice (double click, network retry): return the first result.
  const [existing] = await db()
    .select({ id: payments.id, receiptNo: payments.receiptNo })
    .from(payments)
    .where(and(eq(payments.orgId, actor.orgId), eq(payments.requestId, input.requestId)))
    .limit(1);
  if (existing) return { paymentId: existing.id, receiptNo: existing.receiptNo, duplicate: true };

  await assertPeriodOpen(db(), actor.orgId, input.paidDate);

  try {
    return await db().transaction(async (tx) => {
      const student = await loadStudentForMoney(tx, actor, input.studentId);

      const [account] = await tx
        .select()
        .from(paymentAccounts)
        .where(and(eq(paymentAccounts.id, input.accountId), eq(paymentAccounts.orgId, actor.orgId)))
        .limit(1);
      if (!account || !account.isActive) throw new AppError("VALIDATION", "Choose an active payment account.");
      if (account.method !== "cash" && !input.trxId) {
        throw new AppError("VALIDATION", `Enter the transaction ID for ${account.name}.`);
      }

      const before = await studentAccount(tx, actor.orgId, student.id);
      const { allocations, leftoverPaisa } = allocatePayment(before.dues, input.amount);

      const receiptNo = formatReceiptNo(await nextCounter(tx, actor.orgId, "receipt", 1));
      const [payment] = await tx
        .insert(payments)
        .values({
          orgId: actor.orgId,
          studentId: student.id,
          buildingId: student.buildingId,
          receiptNo,
          amountPaisa: input.amount,
          method: account.method,
          accountId: account.id,
          trxId: input.trxId,
          paidDate: input.paidDate,
          note: input.note,
          balanceBeforePaisa: before.totalPaisa,
          balanceAfterPaisa: before.totalPaisa - input.amount,
          requestId: input.requestId,
          receivedBy: actor.membershipId,
        })
        .returning({ id: payments.id });

      const base = {
        orgId: actor.orgId,
        studentId: student.id,
        buildingId: student.buildingId,
        entryDate: input.paidDate,
        sourceType: "payment" as const,
        sourceId: payment.id,
        createdBy: actor.membershipId,
      };
      await postLedger(tx, [
        ...allocations.map((a) => ({ ...base, period: a.period, head: a.head, amountPaisa: -a.amountPaisa })),
        ...(leftoverPaisa > 0
          ? [
              {
                ...base,
                period: periodOf(input.paidDate),
                head: "credit" as const,
                amountPaisa: -leftoverPaisa,
                description: "Paid in advance",
              },
            ]
          : []),
      ]);

      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "payment.create",
        entityType: "payment",
        entityId: payment.id,
        after: {
          receiptNo,
          amountPaisa: input.amount,
          account: account.name,
          trxId: input.trxId,
          allocations,
          leftoverPaisa,
        },
      });
      return { paymentId: payment.id, receiptNo, duplicate: false };
    });
  } catch (e) {
    if (isPgError(e, PG_UNIQUE_VIOLATION)) {
      throw new AppError("CONFLICT", `Transaction ID ${input.trxId} was already used for another payment.`);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Void
// ---------------------------------------------------------------------------

export async function voidPayment(actor: SessionUser, input: VoidPaymentInput): Promise<void> {
  assertRole(actor, "admin");
  await db().transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, input.paymentId), eq(payments.orgId, actor.orgId)))
      .for("update")
      .limit(1);
    if (!payment) throw new AppError("NOT_FOUND", "Payment not found.");
    if (payment.voidedAt) throw new AppError("CONFLICT", "This payment is already voided.");
    await loadStudentForMoney(tx, actor, payment.studentId);

    const lines = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.sourceType, "payment"), eq(ledgerEntries.sourceId, payment.id)));

    const today = dhakaDate();
    await postLedger(
      tx,
      lines.map((l) => ({
        orgId: l.orgId,
        studentId: l.studentId,
        buildingId: l.buildingId,
        period: l.period,
        entryDate: today,
        head: l.head,
        amountPaisa: l.creditPaisa - l.debitPaisa, // exact opposite
        sourceType: "payment_void" as const,
        sourceId: payment.id,
        description: `Void ${payment.receiptNo}: ${input.reason}`,
        createdBy: actor.membershipId,
      })),
    );

    await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidedBy: actor.membershipId, voidReason: input.reason })
      .where(eq(payments.id, payment.id));

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "payment.void",
      entityType: "payment",
      entityId: payment.id,
      before: payment,
      after: { reason: input.reason },
    });
  });
}

// ---------------------------------------------------------------------------
// Adjustments (admin): opening balances, extra charges, discounts / waivers
// ---------------------------------------------------------------------------

export async function addAdjustment(actor: SessionUser, input: AdjustmentInput): Promise<void> {
  assertRole(actor, "admin");
  await assertPeriodOpen(db(), actor.orgId, input.period);
  await db().transaction(async (tx) => {
    const student = await loadStudentForMoney(tx, actor, input.studentId);
    const signed = input.direction === "charge" ? input.amount : -input.amount;
    await postLedger(tx, [
      {
        orgId: actor.orgId,
        studentId: student.id,
        buildingId: student.buildingId,
        period: input.period,
        entryDate: dhakaDate(),
        head: input.head as LedgerHead,
        amountPaisa: signed,
        sourceType: "adjustment",
        description: input.description,
        createdBy: actor.membershipId,
      },
    ]);
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "ledger.adjustment",
      entityType: "student",
      entityId: student.id,
      after: { ...input, signedPaisa: signed },
    });
  });
}

// ---------------------------------------------------------------------------
// Receipt + collection list
// ---------------------------------------------------------------------------

export async function getReceipt(actor: SessionUser, paymentId: string) {
  const [row] = await db()
    .select({
      payment: payments,
      accountName: paymentAccounts.name,
      student: students,
      buildingCode: buildings.code,
      receivedByName: memberships.fullName,
    })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .innerJoin(paymentAccounts, eq(paymentAccounts.id, payments.accountId))
    .leftJoin(buildings, eq(buildings.id, payments.buildingId))
    .leftJoin(memberships, eq(memberships.id, payments.receivedBy))
    .where(and(eq(payments.id, paymentId), eq(payments.orgId, actor.orgId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Receipt not found.");

  if (actor.role === "student") {
    if (row.student.membershipId !== actor.membershipId) throw new AppError("NOT_FOUND", "Receipt not found.");
  } else {
    const allowed = await accessibleBuildingIds(actor);
    if (allowed && (!row.payment.buildingId || !allowed.includes(row.payment.buildingId))) {
      throw new AppError("NOT_FOUND", "Receipt not found.");
    }
  }

  const [seat] = await db()
    .select({ roomNumber: rooms.number, seatLabel: seats.label })
    .from(seatAssignments)
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(
      and(
        eq(seatAssignments.studentId, row.student.id),
        lte(seatAssignments.startDate, row.payment.paidDate),
        sql`(${seatAssignments.endDate} IS NULL OR ${seatAssignments.endDate} > ${row.payment.paidDate})`,
      ),
    )
    .limit(1);

  const lines = await db()
    .select({ head: ledgerEntries.head, period: ledgerEntries.period, creditPaisa: ledgerEntries.creditPaisa })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.sourceType, "payment"), eq(ledgerEntries.sourceId, row.payment.id)))
    .orderBy(asc(ledgerEntries.period));

  return {
    ...row,
    seat: seat ?? null,
    allocations: lines.map((l) => ({ head: l.head, period: l.period, amountPaisa: l.creditPaisa })) as Allocation[],
  };
}

export type CollectionFilters = { from: DateString; to: DateString; buildingId?: string; accountId?: string };

export async function listCollections(actor: SessionUser, filters: CollectionFilters) {
  assertRole(actor, "admin", "cashier");
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && allowed.length === 0) {
    return { rows: [], totals: { totalPaisa: 0, count: 0, byAccount: [] } };
  }

  const where: SQL[] = [
    eq(payments.orgId, actor.orgId),
    gte(payments.paidDate, filters.from),
    lte(payments.paidDate, filters.to),
  ];
  if (allowed) where.push(inArray(payments.buildingId, allowed));
  if (filters.buildingId) where.push(eq(payments.buildingId, filters.buildingId));
  if (filters.accountId) where.push(eq(payments.accountId, filters.accountId));

  const rows = await db()
    .select({
      id: payments.id,
      receiptNo: payments.receiptNo,
      paidDate: payments.paidDate,
      amountPaisa: payments.amountPaisa,
      method: payments.method,
      trxId: payments.trxId,
      voidedAt: payments.voidedAt,
      accountId: payments.accountId,
      accountName: paymentAccounts.name,
      studentId: students.id,
      studentName: students.fullName,
      studentCode: students.studentCode,
      buildingCode: buildings.code,
      receivedByName: memberships.fullName,
    })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .innerJoin(paymentAccounts, eq(paymentAccounts.id, payments.accountId))
    .leftJoin(buildings, eq(buildings.id, payments.buildingId))
    .leftJoin(memberships, eq(memberships.id, payments.receivedBy))
    .where(and(...where))
    .orderBy(desc(payments.paidDate), desc(payments.createdAt))
    .limit(500);

  const valid = rows.filter((r) => !r.voidedAt);
  const byAccountMap = new Map<
    string,
    { accountName: string; method: PaymentMethod; totalPaisa: Paisa; count: number }
  >();
  for (const r of valid) {
    const t = byAccountMap.get(r.accountId) ?? {
      accountName: r.accountName,
      method: r.method,
      totalPaisa: 0,
      count: 0,
    };
    t.totalPaisa += r.amountPaisa;
    t.count++;
    byAccountMap.set(r.accountId, t);
  }
  return {
    rows,
    totals: {
      totalPaisa: valid.reduce((s, r) => s + r.amountPaisa, 0),
      count: valid.length,
      byAccount: [...byAccountMap.values()].sort((a, b) => b.totalPaisa - a.totalPaisa),
    },
  };
}
