import "server-only";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { Period } from "@/lib/dates";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  billingPeriods,
  buildings,
  ledgerEntries,
  paymentAccounts,
  students,
  tokenLines,
  tokens,
} from "@/server/db/schema";
import { tokenPaymentStatus, type LedgerLine, type TokenStatus } from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { accessibleBuildingIds } from "./buildings";

export async function listBillingPeriods(actor: SessionUser) {
  assertRole(actor, "admin", "cashier");
  return db()
    .select()
    .from(billingPeriods)
    .where(eq(billingPeriods.orgId, actor.orgId))
    .orderBy(desc(billingPeriods.period))
    .limit(24);
}

/** Ledger lines grouped by student, for working out Paid / Partial / Unpaid. */
async function linesByStudent(orgId: string, studentIds: string[]): Promise<Map<string, LedgerLine[]>> {
  const map = new Map<string, LedgerLine[]>();
  if (studentIds.length === 0) return map;
  const rows = await db()
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

export type TokenListRow = {
  id: string;
  kind: "monthly" | "admission";
  studentId: string;
  studentCode: string;
  fullName: string;
  buildingCode: string | null;
  seatText: string | null;
  currentTotalPaisa: number;
  previousTotalPaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  remainingPaisa: number;
  status: TokenStatus;
};

export async function listTokens(
  actor: SessionUser,
  period: Period,
  buildingId?: string,
  status?: TokenStatus | "due",
): Promise<TokenListRow[]> {
  assertRole(actor, "admin", "cashier");
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && allowed.length === 0) return [];
  const where: SQL[] = [eq(tokens.orgId, actor.orgId), eq(tokens.period, period)];
  if (allowed) where.push(inArray(tokens.buildingId, allowed));
  if (buildingId) where.push(eq(tokens.buildingId, buildingId));
  return db()
    .select({
      id: tokens.id,
      kind: tokens.kind,
      studentId: tokens.studentId,
      studentCode: students.studentCode,
      fullName: students.fullName,
      buildingCode: buildings.code,
      seatText: tokens.seatText,
      currentTotalPaisa: tokens.currentTotalPaisa,
      previousTotalPaisa: tokens.previousTotalPaisa,
      totalPaisa: tokens.totalPaisa,
    })
    .from(tokens)
    .innerJoin(students, eq(students.id, tokens.studentId))
    .leftJoin(buildings, eq(buildings.id, tokens.buildingId))
    .where(and(...where))
    .orderBy(asc(buildings.code), asc(tokens.seatText), asc(students.fullName))
    .then(async (rows) => {
      const lines = await linesByStudent(
        actor.orgId,
        rows.map((r) => r.studentId),
      );
      return rows
        .map((r) => ({ ...r, ...tokenPaymentStatus(lines.get(r.studentId) ?? [], period, r.totalPaisa) }))
        .filter((r) => !status || (status === "due" ? r.status !== "paid" : r.status === status));
    });
}

export type PrintableToken = {
  id: string;
  period: Period;
  kind: "monthly" | "admission";
  studentName: string;
  studentCode: string;
  buildingCode: string;
  seatText: string;
  currentTotalPaisa: number;
  previousTotalPaisa: number;
  totalPaisa: number;
  current: { label: string; amountPaisa: number }[];
  previous: { label: string; amountPaisa: number }[];
};

/** Tokens to print: a whole month (optionally one building), or one token. Students only get their own. */
export async function getPrintableTokens(
  actor: SessionUser,
  query: { period?: Period; buildingId?: string; tokenId?: string },
): Promise<{ tokens: PrintableToken[]; accounts: { name: string; details: string | null }[] }> {
  const where: SQL[] = [eq(tokens.orgId, actor.orgId)];
  if (query.tokenId) where.push(eq(tokens.id, query.tokenId));
  else if (query.period) where.push(eq(tokens.period, query.period));
  else throw new AppError("VALIDATION", "Choose a month.");
  if (query.buildingId) where.push(eq(tokens.buildingId, query.buildingId));

  if (actor.role === "student") {
    where.push(eq(students.membershipId, actor.membershipId));
  } else {
    assertRole(actor, "admin", "cashier");
    const allowed = await accessibleBuildingIds(actor);
    if (allowed) {
      if (allowed.length === 0) return { tokens: [], accounts: [] };
      where.push(inArray(tokens.buildingId, allowed));
    }
  }

  const rows = await db()
    .select({
      id: tokens.id,
      period: tokens.period,
      kind: tokens.kind,
      studentName: students.fullName,
      studentCode: students.studentCode,
      buildingCode: buildings.code,
      seatText: tokens.seatText,
      currentTotalPaisa: tokens.currentTotalPaisa,
      previousTotalPaisa: tokens.previousTotalPaisa,
      totalPaisa: tokens.totalPaisa,
    })
    .from(tokens)
    .innerJoin(students, eq(students.id, tokens.studentId))
    .leftJoin(buildings, eq(buildings.id, tokens.buildingId))
    .where(and(...where))
    .orderBy(asc(buildings.code), asc(tokens.seatText), asc(students.fullName));

  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db().select().from(tokenLines).where(inArray(tokenLines.tokenId, ids)).orderBy(asc(tokenLines.sort))
    : [];
  const accounts = await db()
    .select({ name: paymentAccounts.name, details: paymentAccounts.details, method: paymentAccounts.method })
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.orgId, actor.orgId), eq(paymentAccounts.isActive, true)))
    .orderBy(asc(paymentAccounts.method), asc(paymentAccounts.name));

  return {
    tokens: rows.map((r) => ({
      ...r,
      buildingCode: r.buildingCode ?? "",
      seatText: (r.seatText ?? "").replace(/^.*? · /, ""),
      current: lines.filter((l) => l.tokenId === r.id && l.kind === "current"),
      previous: lines.filter((l) => l.tokenId === r.id && l.kind === "previous"),
    })),
    accounts: accounts.filter((a) => a.method !== "cash").map((a) => ({ name: a.name, details: a.details })),
  };
}

export async function listStudentTokens(actor: SessionUser, studentId: string) {
  const [student] = await db()
    .select({ id: students.id, buildingId: students.buildingId, membershipId: students.membershipId })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.orgId, actor.orgId)))
    .limit(1);
  if (!student) throw new AppError("NOT_FOUND", "Student not found.");
  if (actor.role === "student") {
    if (student.membershipId !== actor.membershipId) throw new AppError("NOT_FOUND", "Student not found.");
  } else {
    const allowed = await accessibleBuildingIds(actor);
    if (allowed && (!student.buildingId || !allowed.includes(student.buildingId))) {
      throw new AppError("NOT_FOUND", "Student not found.");
    }
  }
  const [rows, lines] = await Promise.all([
    db()
      .select({
        id: tokens.id,
        period: tokens.period,
        kind: tokens.kind,
        totalPaisa: tokens.totalPaisa,
        seatText: tokens.seatText,
      })
      .from(tokens)
      .where(eq(tokens.studentId, student.id))
      .orderBy(desc(tokens.period))
      .limit(24),
    linesByStudent(actor.orgId, [student.id]),
  ]);
  return rows.map((r) => ({ ...r, ...tokenPaymentStatus(lines.get(student.id) ?? [], r.period, r.totalPaisa) }));
}
