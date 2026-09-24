import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { periodEnd, periodStart, type DateString, type Period } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  auditLogs,
  batches,
  buildings,
  ledgerEntries,
  mealSettlements,
  memberships,
  paymentAccounts,
  payments,
  rooms,
  seatAssignments,
  seats,
  students,
  type StudentStatus,
} from "@/server/db/schema";
import { balancesByHead, type LedgerHead } from "@/server/domain/billing";
import { compareRoomNumbers } from "@/server/domain/rooms";
import { AppError } from "@/server/errors";
import { accessibleBuildingIds } from "./buildings";
import { advanceHeld } from "./leave";
import { listTokens } from "./tokens";

/**
 * Read-only reports for admin and cashier. Cashiers only ever see their own buildings.
 * All money comes from the ledger / payments, so reports always agree with student accounts.
 */

type Scope = { allowed: string[] | null; empty: boolean };

async function scopeFor(actor: SessionUser, buildingId?: string): Promise<Scope> {
  assertRole(actor, "admin", "cashier");
  const allowed = await accessibleBuildingIds(actor);
  if (buildingId && allowed && !allowed.includes(buildingId)) {
    throw new AppError("FORBIDDEN", "This building is not assigned to you.");
  }
  const ids = buildingId ? [buildingId] : allowed;
  return { allowed: ids, empty: !!ids && ids.length === 0 };
}

const sumPaisaSql = (col: AnyPgColumn) => sql<string>`coalesce(sum(${col}), 0)`.mapWith(Number);

// ---------------------------------------------------------------------------
// Dues, credit and advance per student
// ---------------------------------------------------------------------------

export type BalanceFilters = {
  buildingId?: string;
  status?: StudentStatus | "all";
  batchId?: string;
  /** due = owes money, credit = hostel owes the student, all = everyone. */
  show?: "due" | "credit" | "all";
};

export type BalanceRow = {
  studentId: string;
  studentCode: string;
  fullName: string;
  phone: string;
  status: StudentStatus;
  leftDate: string | null;
  buildingId: string | null;
  buildingCode: string;
  batchName: string | null;
  seatText: string;
  balances: Partial<Record<LedgerHead, Paisa>>;
  totalPaisa: Paisa;
  advanceHeldPaisa: Paisa;
};

export type BalanceTotals = {
  students: number;
  withDue: number;
  duePaisa: Paisa;
  withCredit: number;
  creditPaisa: Paisa;
  advanceHeldPaisa: Paisa;
};

const emptyBalanceTotals = (): BalanceTotals => ({
  students: 0,
  withDue: 0,
  duePaisa: 0,
  withCredit: 0,
  creditPaisa: 0,
  advanceHeldPaisa: 0,
});

function addToTotals(t: BalanceTotals, r: BalanceRow) {
  t.students++;
  if (r.totalPaisa > 0) {
    t.withDue++;
    t.duePaisa += r.totalPaisa;
  } else if (r.totalPaisa < 0) {
    t.withCredit++;
    t.creditPaisa += -r.totalPaisa;
  }
  t.advanceHeldPaisa += r.advanceHeldPaisa;
}

export async function balanceReport(actor: SessionUser, filters: BalanceFilters = {}) {
  const scope = await scopeFor(actor, filters.buildingId);
  const result = {
    rows: [] as BalanceRow[],
    byBuilding: [] as (BalanceTotals & { buildingCode: string })[],
    totals: emptyBalanceTotals(),
  };
  if (scope.empty) return result;

  const status = filters.status ?? "active";
  const where: SQL[] = [eq(students.orgId, actor.orgId)];
  if (scope.allowed) where.push(inArray(students.buildingId, scope.allowed));
  if (status !== "all") where.push(eq(students.status, status));
  if (filters.batchId) where.push(eq(students.batchId, filters.batchId));

  const list = await db()
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      phone: students.phone,
      status: students.status,
      leftDate: students.leftDate,
      buildingId: students.buildingId,
      buildingCode: buildings.code,
      batchName: batches.name,
      roomNumber: rooms.number,
      seatLabel: seats.label,
    })
    .from(students)
    .leftJoin(buildings, eq(buildings.id, students.buildingId))
    .leftJoin(batches, eq(batches.id, students.batchId))
    .leftJoin(seatAssignments, and(eq(seatAssignments.studentId, students.id), isNull(seatAssignments.endDate)))
    .leftJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .leftJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(and(...where));
  if (list.length === 0) return result;

  const lines = await db()
    .select({
      studentId: ledgerEntries.studentId,
      head: ledgerEntries.head,
      period: ledgerEntries.period,
      debitPaisa: ledgerEntries.debitPaisa,
      creditPaisa: ledgerEntries.creditPaisa,
      sourceType: ledgerEntries.sourceType,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.orgId, actor.orgId),
        inArray(
          ledgerEntries.studentId,
          list.map((s) => s.studentId),
        ),
      ),
    );
  const linesByStudent = new Map<string, typeof lines>();
  for (const l of lines) linesByStudent.set(l.studentId, [...(linesByStudent.get(l.studentId) ?? []), l]);

  const all: BalanceRow[] = list.map((s) => {
    const own = linesByStudent.get(s.studentId) ?? [];
    const balances = balancesByHead(own);
    return {
      studentId: s.studentId,
      studentCode: s.studentCode,
      fullName: s.fullName,
      phone: s.phone,
      status: s.status,
      leftDate: s.leftDate,
      buildingId: s.buildingId,
      buildingCode: s.buildingCode ?? "",
      batchName: s.batchName,
      seatText: s.roomNumber ? `${s.roomNumber}-${s.seatLabel}` : "",
      balances,
      totalPaisa: Object.values(balances).reduce((a, v) => a + (v ?? 0), 0),
      advanceHeldPaisa: s.status === "active" ? advanceHeld(own) : 0,
    };
  });

  const byBuilding = new Map<string, BalanceTotals & { buildingCode: string }>();
  for (const r of all) {
    const t = byBuilding.get(r.buildingCode) ?? { ...emptyBalanceTotals(), buildingCode: r.buildingCode };
    addToTotals(t, r);
    addToTotals(result.totals, r);
    byBuilding.set(r.buildingCode, t);
  }

  const show = filters.show ?? "due";
  result.rows = all
    .filter((r) => show === "all" || (show === "due" ? r.totalPaisa > 0 : r.totalPaisa < 0))
    .sort(
      (a, b) =>
        compareRoomNumbers(a.buildingCode, b.buildingCode) ||
        compareRoomNumbers(a.seatText, b.seatText) ||
        a.fullName.localeCompare(b.fullName),
    );
  result.byBuilding = [...byBuilding.values()].sort((a, b) => compareRoomNumbers(a.buildingCode, b.buildingCode));
  return result;
}

// ---------------------------------------------------------------------------
// Collections summary (money received)
// ---------------------------------------------------------------------------

export async function collectionSummary(
  actor: SessionUser,
  filters: { from: DateString; to: DateString; buildingId?: string },
) {
  const scope = await scopeFor(actor, filters.buildingId);
  const empty = {
    totalPaisa: 0,
    count: 0,
    byDay: [] as { date: string; totalPaisa: number; count: number }[],
    byAccount: [] as { name: string; method: string; totalPaisa: number; count: number }[],
    byBuilding: [] as { buildingCode: string; totalPaisa: number; count: number }[],
    byPerson: [] as { name: string; totalPaisa: number; count: number }[],
  };
  if (scope.empty) return empty;

  const where: SQL[] = [
    eq(payments.orgId, actor.orgId),
    gte(payments.paidDate, filters.from),
    lte(payments.paidDate, filters.to),
    isNull(payments.voidedAt),
  ];
  if (scope.allowed) where.push(inArray(payments.buildingId, scope.allowed));
  const cond = and(...where);
  const total = sumPaisaSql(payments.amountPaisa);
  const n = sql<number>`count(*)`.mapWith(Number);

  const [byDay, byAccount, byBuilding, byPerson] = await Promise.all([
    db()
      .select({ date: payments.paidDate, totalPaisa: total, count: n })
      .from(payments)
      .where(cond)
      .groupBy(payments.paidDate)
      .orderBy(asc(payments.paidDate)),
    db()
      .select({ name: paymentAccounts.name, method: paymentAccounts.method, totalPaisa: total, count: n })
      .from(payments)
      .innerJoin(paymentAccounts, eq(paymentAccounts.id, payments.accountId))
      .where(cond)
      .groupBy(paymentAccounts.name, paymentAccounts.method)
      .orderBy(desc(total)),
    db()
      .select({ buildingCode: sql<string>`coalesce(${buildings.code}, '—')`, totalPaisa: total, count: n })
      .from(payments)
      .leftJoin(buildings, eq(buildings.id, payments.buildingId))
      .where(cond)
      .groupBy(buildings.code),
    db()
      .select({ name: sql<string>`coalesce(${memberships.fullName}, '—')`, totalPaisa: total, count: n })
      .from(payments)
      .leftJoin(memberships, eq(memberships.id, payments.receivedBy))
      .where(cond)
      .groupBy(memberships.fullName)
      .orderBy(desc(total)),
  ]);

  return {
    totalPaisa: byDay.reduce((s, d) => s + d.totalPaisa, 0),
    count: byDay.reduce((s, d) => s + d.count, 0),
    byDay,
    byAccount,
    byBuilding: byBuilding.sort((a, b) => compareRoomNumbers(a.buildingCode, b.buildingCode)),
    byPerson,
  };
}

// ---------------------------------------------------------------------------
// Meal settlement of a closed month
// ---------------------------------------------------------------------------

export async function mealSettlementReport(actor: SessionUser, period: Period, buildingId?: string) {
  const scope = await scopeFor(actor, buildingId);
  const totals = { students: 0, costPaisa: 0, depositPaisa: 0, studentsOwePaisa: 0, hostelOwesPaisa: 0, netPaisa: 0 };
  if (scope.empty) return { rows: [], totals };

  const where: SQL[] = [eq(mealSettlements.orgId, actor.orgId), eq(mealSettlements.period, period)];
  if (scope.allowed) where.push(inArray(mealSettlements.buildingId, scope.allowed));
  const rows = await db()
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      status: students.status,
      buildingCode: buildings.code,
      breakfast: mealSettlements.breakfast,
      lunch: mealSettlements.lunch,
      dinner: mealSettlements.dinner,
      costPaisa: mealSettlements.costPaisa,
      depositPaisa: mealSettlements.depositPaisa,
      differencePaisa: mealSettlements.differencePaisa,
    })
    .from(mealSettlements)
    .innerJoin(students, eq(students.id, mealSettlements.studentId))
    .leftJoin(buildings, eq(buildings.id, mealSettlements.buildingId))
    .where(and(...where));

  for (const r of rows) {
    totals.students++;
    totals.costPaisa += r.costPaisa;
    totals.depositPaisa += r.depositPaisa;
    if (r.differencePaisa > 0) totals.studentsOwePaisa += r.differencePaisa;
    else totals.hostelOwesPaisa += -r.differencePaisa;
    totals.netPaisa += r.differencePaisa;
  }
  rows.sort(
    (a, b) => compareRoomNumbers(a.buildingCode ?? "", b.buildingCode ?? "") || a.fullName.localeCompare(b.fullName),
  );
  return { rows, totals };
}

// ---------------------------------------------------------------------------
// Month summary per building
// ---------------------------------------------------------------------------

export const BILLED_HEADS = ["rent", "meal", "baburchi", "service_charge", "advance", "other"] as const;
type BilledHead = (typeof BILLED_HEADS)[number];

export type MonthBuildingRow = {
  buildingCode: string;
  tokens: number;
  paid: number;
  partial: number;
  unpaid: number;
  billed: Record<BilledHead, Paisa>;
  billedTotalPaisa: Paisa;
  collectedPaisa: Paisa;
  mealCostPaisa: Paisa;
  mealStudents: number;
};

export async function monthReport(actor: SessionUser, period: Period) {
  const scope = await scopeFor(actor);
  if (scope.empty) return { rows: [] as MonthBuildingRow[], total: null };

  const ledgerWhere: SQL[] = [
    eq(ledgerEntries.orgId, actor.orgId),
    eq(ledgerEntries.period, period),
    inArray(ledgerEntries.sourceType, ["token", "admission"]),
  ];
  const payWhere: SQL[] = [
    eq(payments.orgId, actor.orgId),
    gte(payments.paidDate, periodStart(period)),
    lte(payments.paidDate, periodEnd(period)),
    isNull(payments.voidedAt),
  ];
  const mealWhere: SQL[] = [eq(mealSettlements.orgId, actor.orgId), eq(mealSettlements.period, period)];
  const buildingWhere: SQL[] = [eq(buildings.orgId, actor.orgId)];
  if (scope.allowed) {
    ledgerWhere.push(inArray(ledgerEntries.buildingId, scope.allowed));
    payWhere.push(inArray(payments.buildingId, scope.allowed));
    mealWhere.push(inArray(mealSettlements.buildingId, scope.allowed));
    buildingWhere.push(inArray(buildings.id, scope.allowed));
  }

  const [buildingRows, billed, collected, meals, tokenRows] = await Promise.all([
    db()
      .select({ id: buildings.id, code: buildings.code })
      .from(buildings)
      .where(and(...buildingWhere)),
    db()
      .select({
        buildingId: ledgerEntries.buildingId,
        head: ledgerEntries.head,
        totalPaisa: sumPaisaSql(ledgerEntries.debitPaisa),
      })
      .from(ledgerEntries)
      .where(and(...ledgerWhere))
      .groupBy(ledgerEntries.buildingId, ledgerEntries.head),
    db()
      .select({ buildingId: payments.buildingId, totalPaisa: sumPaisaSql(payments.amountPaisa) })
      .from(payments)
      .where(and(...payWhere))
      .groupBy(payments.buildingId),
    db()
      .select({
        buildingId: mealSettlements.buildingId,
        costPaisa: sumPaisaSql(mealSettlements.costPaisa),
        students: sql<number>`count(*)`.mapWith(Number),
      })
      .from(mealSettlements)
      .where(and(...mealWhere))
      .groupBy(mealSettlements.buildingId),
    listTokens(actor, period),
  ]);

  const codeOf = new Map(buildingRows.map((b) => [b.id, b.code]));
  const rowsByCode = new Map<string, MonthBuildingRow>();
  const row = (code: string) => {
    let r = rowsByCode.get(code);
    if (!r) {
      r = {
        buildingCode: code,
        tokens: 0,
        paid: 0,
        partial: 0,
        unpaid: 0,
        billed: { rent: 0, meal: 0, baburchi: 0, service_charge: 0, advance: 0, other: 0 },
        billedTotalPaisa: 0,
        collectedPaisa: 0,
        mealCostPaisa: 0,
        mealStudents: 0,
      };
      rowsByCode.set(code, r);
    }
    return r;
  };
  for (const b of buildingRows) row(b.code);
  const code = (id: string | null) => (id ? (codeOf.get(id) ?? "—") : "—");

  for (const b of billed) {
    if (!(BILLED_HEADS as readonly string[]).includes(b.head)) continue;
    const r = row(code(b.buildingId));
    r.billed[b.head as BilledHead] += b.totalPaisa;
    r.billedTotalPaisa += b.totalPaisa;
  }
  for (const c of collected) row(code(c.buildingId)).collectedPaisa += c.totalPaisa;
  for (const m of meals) {
    const r = row(code(m.buildingId));
    r.mealCostPaisa += m.costPaisa;
    r.mealStudents += m.students;
  }
  for (const t of tokenRows) {
    const r = row(t.buildingCode ?? "—");
    r.tokens++;
    r[t.status]++;
  }

  const rows = [...rowsByCode.values()].sort((a, b) => compareRoomNumbers(a.buildingCode, b.buildingCode));
  const total = rows.reduce<MonthBuildingRow>(
    (t, r) => {
      t.tokens += r.tokens;
      t.paid += r.paid;
      t.partial += r.partial;
      t.unpaid += r.unpaid;
      for (const h of BILLED_HEADS) t.billed[h] += r.billed[h];
      t.billedTotalPaisa += r.billedTotalPaisa;
      t.collectedPaisa += r.collectedPaisa;
      t.mealCostPaisa += r.mealCostPaisa;
      t.mealStudents += r.mealStudents;
      return t;
    },
    {
      buildingCode: "All buildings",
      tokens: 0,
      paid: 0,
      partial: 0,
      unpaid: 0,
      billed: { rent: 0, meal: 0, baburchi: 0, service_charge: 0, advance: 0, other: 0 },
      billedTotalPaisa: 0,
      collectedPaisa: 0,
      mealCostPaisa: 0,
      mealStudents: 0,
    },
  );
  return { rows, total };
}

// ---------------------------------------------------------------------------
// Audit log (admin only)
// ---------------------------------------------------------------------------

export const AUDIT_PAGE_SIZE = 100;

export async function listAuditLog(actor: SessionUser, filters: { action?: string; page?: number } = {}) {
  assertRole(actor, "admin");
  const where: SQL[] = [eq(auditLogs.orgId, actor.orgId)];
  if (filters.action) where.push(ilike(auditLogs.action, `${filters.action.replace(/[%_\\]/g, "")}%`));
  const page = Math.max(1, filters.page ?? 1);
  const rows = await db()
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      before: auditLogs.before,
      after: auditLogs.after,
      actorName: memberships.fullName,
      actorRole: memberships.role,
    })
    .from(auditLogs)
    .leftJoin(memberships, eq(memberships.id, auditLogs.actorMembershipId))
    .where(and(...where))
    .orderBy(desc(auditLogs.createdAt))
    .limit(AUDIT_PAGE_SIZE + 1)
    .offset((page - 1) * AUDIT_PAGE_SIZE);
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE, page };
}

/** Distinct first word of actions ("payment", "meal", …) for the filter. */
export async function auditActionGroups(actor: SessionUser): Promise<string[]> {
  assertRole(actor, "admin");
  const rows = await db()
    .selectDistinct({ group: sql<string>`split_part(${auditLogs.action}, '.', 1)` })
    .from(auditLogs)
    .where(eq(auditLogs.orgId, actor.orgId));
  return rows.map((r) => r.group).sort();
}
