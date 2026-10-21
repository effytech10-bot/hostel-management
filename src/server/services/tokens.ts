import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Period } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import { normalizeBdPhone } from "@/lib/phone";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  billingPeriods,
  buildings,
  ledgerEntries,
  mealSettlements,
  memberships,
  paymentAccounts,
  payments,
  students,
  tokenLines,
  tokens,
} from "@/server/db/schema";
import { tokenPaymentStatus, type LedgerLine, type TokenStatus } from "@/server/domain/billing";
import { normalizeTokenQuery, tokenState, type TokenState } from "@/server/domain/tokens";
import { AppError } from "@/server/errors";
import { accessibleBuildingIds } from "./buildings";

export type { TokenState };

export async function listBillingPeriods(actor: SessionUser) {
  assertRole(actor, "admin", "cashier");
  return db()
    .select()
    .from(billingPeriods)
    .where(eq(billingPeriods.orgId, actor.orgId))
    .orderBy(desc(billingPeriods.period))
    .limit(24);
}

/** Ledger lines grouped by student, for working out what is still unpaid. */
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

/** Newest token month per student. */
async function latestPeriods(studentIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (studentIds.length === 0) return map;
  const rows = await db()
    .select({ studentId: tokens.studentId, period: sql<string>`max(${tokens.period})` })
    .from(tokens)
    .where(inArray(tokens.studentId, studentIds))
    .groupBy(tokens.studentId);
  for (const r of rows) map.set(r.studentId, r.period);
  return map;
}

/** Money received on each token (voided payments not counted). */
async function paidOnTokens(tokenIds: string[]): Promise<Map<string, Paisa>> {
  const map = new Map<string, Paisa>();
  if (tokenIds.length === 0) return map;
  const rows = await db()
    .select({
      tokenId: payments.tokenId,
      total: sql<string>`coalesce(sum(${payments.amountPaisa}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(and(inArray(payments.tokenId, tokenIds), isNull(payments.voidedAt)))
    .groupBy(payments.tokenId);
  for (const r of rows) if (r.tokenId) map.set(r.tokenId, r.total);
  return map;
}

function stateOf(
  lines: LedgerLine[],
  token: { period: string; totalPaisa: number },
  isLatest: boolean,
  paidHere: Paisa,
) {
  const s = tokenPaymentStatus(lines, token.period, token.totalPaisa);
  return {
    status: s.status,
    remainingPaisa: s.remainingPaisa,
    state: tokenState({ isLatest, remainingPaisa: s.remainingPaisa, paidPaisa: paidHere }),
  };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export type TokenListRow = {
  id: string;
  code: string | null;
  kind: "monthly" | "admission";
  early: boolean;
  period: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  buildingCode: string | null;
  seatText: string | null;
  currentTotalPaisa: number;
  previousTotalPaisa: number;
  totalPaisa: number;
  /** Money received on this token. */
  paidHerePaisa: number;
  remainingPaisa: number;
  status: TokenStatus;
  state: TokenState;
};

export async function listTokens(
  actor: SessionUser,
  period: Period,
  buildingId?: string,
  filter?: TokenState | TokenStatus | "due",
): Promise<TokenListRow[]> {
  assertRole(actor, "admin", "cashier");
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && allowed.length === 0) return [];
  const where: SQL[] = [eq(tokens.orgId, actor.orgId), eq(tokens.period, period)];
  if (allowed) where.push(inArray(tokens.buildingId, allowed));
  if (buildingId) where.push(eq(tokens.buildingId, buildingId));
  const rows = await db()
    .select({
      id: tokens.id,
      code: tokens.code,
      kind: tokens.kind,
      early: tokens.early,
      period: tokens.period,
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
    .orderBy(asc(buildings.code), asc(tokens.seatText), asc(students.fullName));
  const ids = rows.map((r) => r.studentId);
  const [lines, latest, paid] = await Promise.all([
    linesByStudent(actor.orgId, ids),
    latestPeriods(ids),
    paidOnTokens(rows.map((r) => r.id)),
  ]);
  return rows
    .map((r) => {
      const paidHerePaisa = paid.get(r.id) ?? 0;
      return {
        ...r,
        paidHerePaisa,
        ...stateOf(lines.get(r.studentId) ?? [], r, latest.get(r.studentId) === r.period, paidHerePaisa),
      };
    })
    .filter(
      (r) =>
        !filter ||
        (filter === "due"
          ? r.remainingPaisa > 0
          : r.state === filter || (filter === r.status && r.state !== "carried")),
    );
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
  const rows = await db()
    .select({
      id: tokens.id,
      code: tokens.code,
      period: tokens.period,
      kind: tokens.kind,
      early: tokens.early,
      totalPaisa: tokens.totalPaisa,
      seatText: tokens.seatText,
    })
    .from(tokens)
    .where(eq(tokens.studentId, student.id))
    .orderBy(desc(tokens.period))
    .limit(36);
  const [lines, paid] = await Promise.all([
    linesByStudent(actor.orgId, [student.id]),
    paidOnTokens(rows.map((r) => r.id)),
  ]);
  return rows.map((r, i) => {
    const paidHerePaisa = paid.get(r.id) ?? 0;
    return { ...r, paidHerePaisa, ...stateOf(lines.get(student.id) ?? [], r, i === 0, paidHerePaisa) };
  });
}

// ---------------------------------------------------------------------------
// Finding a token (cashier types a token ID, a Student ID or a phone number)
// ---------------------------------------------------------------------------

/** The student's newest token code for what was typed. Any of their token IDs leads to the newest one. */
export async function findLatestToken(actor: SessionUser, query: string): Promise<{ code: string; studentId: string }> {
  assertRole(actor, "admin", "cashier");
  const q = normalizeTokenQuery(query);
  if (!q) throw new AppError("VALIDATION", "Type a token ID, Student ID or phone number.");

  let studentId: string | null = null;
  const [byCode] = await db()
    .select({ studentId: tokens.studentId })
    .from(tokens)
    .where(and(eq(tokens.orgId, actor.orgId), eq(tokens.code, q)))
    .limit(1);
  if (byCode) studentId = byCode.studentId;
  if (!studentId) {
    const phone = normalizeBdPhone(q);
    const [s] = await db()
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.orgId, actor.orgId), phone ? eq(students.phone, phone) : eq(students.studentCode, q)))
      .orderBy(asc(students.status))
      .limit(1);
    if (s) studentId = s.id;
  }
  if (!studentId) throw new AppError("NOT_FOUND", `No token or student found for "${query.trim()}".`);

  const [student] = await db()
    .select({ buildingId: students.buildingId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && (!student?.buildingId || !allowed.includes(student.buildingId))) {
    throw new AppError("NOT_FOUND", "This student is not in one of your buildings.");
  }
  const [latest] = await db()
    .select({ code: tokens.code })
    .from(tokens)
    .where(eq(tokens.studentId, studentId))
    .orderBy(desc(tokens.period))
    .limit(1);
  if (!latest?.code) throw new AppError("NOT_FOUND", "This student has no token yet.");
  return { code: latest.code, studentId };
}

// ---------------------------------------------------------------------------
// One token with its payments
// ---------------------------------------------------------------------------

export async function getTokenView(actor: SessionUser, code: string) {
  const [row] = await db()
    .select({ token: tokens, student: students, buildingCode: buildings.code })
    .from(tokens)
    .innerJoin(students, eq(students.id, tokens.studentId))
    .leftJoin(buildings, eq(buildings.id, tokens.buildingId))
    .where(and(eq(tokens.orgId, actor.orgId), eq(tokens.code, normalizeTokenQuery(code))))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Token not found.");
  if (actor.role === "student") {
    if (row.student.membershipId !== actor.membershipId) throw new AppError("NOT_FOUND", "Token not found.");
  } else {
    const allowed = await accessibleBuildingIds(actor);
    if (allowed && (!row.token.buildingId || !allowed.includes(row.token.buildingId))) {
      throw new AppError("NOT_FOUND", "Token not found.");
    }
  }

  const [lines, paymentRows, latestRow, settlement, ledger] = await Promise.all([
    db().select().from(tokenLines).where(eq(tokenLines.tokenId, row.token.id)).orderBy(asc(tokenLines.sort)),
    db()
      .select({
        id: payments.id,
        receiptNo: payments.receiptNo,
        amountPaisa: payments.amountPaisa,
        method: payments.method,
        trxId: payments.trxId,
        paidDate: payments.paidDate,
        note: payments.note,
        voidedAt: payments.voidedAt,
        voidReason: payments.voidReason,
        accountName: paymentAccounts.name,
        receivedByName: memberships.fullName,
        balanceAfterPaisa: payments.balanceAfterPaisa,
      })
      .from(payments)
      .innerJoin(paymentAccounts, eq(paymentAccounts.id, payments.accountId))
      .leftJoin(memberships, eq(memberships.id, payments.receivedBy))
      .where(eq(payments.tokenId, row.token.id))
      .orderBy(asc(payments.createdAt)),
    db()
      .select({ code: tokens.code, period: tokens.period })
      .from(tokens)
      .where(eq(tokens.studentId, row.student.id))
      .orderBy(desc(tokens.period))
      .limit(1),
    db().select().from(mealSettlements).where(eq(mealSettlements.tokenId, row.token.id)).limit(1),
    linesByStudent(actor.orgId, [row.student.id]),
  ]);
  const latest = latestRow[0];
  const isLatest = latest?.period === row.token.period;
  const paidHerePaisa = paymentRows.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountPaisa, 0);
  const st = stateOf(ledger.get(row.student.id) ?? [], row.token, isLatest, paidHerePaisa);
  const accounts =
    actor.role === "student"
      ? []
      : await db()
          .select({
            id: paymentAccounts.id,
            name: paymentAccounts.name,
            method: paymentAccounts.method,
            details: paymentAccounts.details,
          })
          .from(paymentAccounts)
          .where(and(eq(paymentAccounts.orgId, actor.orgId), eq(paymentAccounts.isActive, true)))
          .orderBy(asc(paymentAccounts.method), asc(paymentAccounts.name));

  return {
    token: row.token,
    student: {
      id: row.student.id,
      code: row.student.studentCode,
      name: row.student.fullName,
      phone: row.student.phone,
      status: row.student.status,
      college: row.student.college,
    },
    buildingCode: row.buildingCode,
    current: lines.filter((l) => l.kind === "current"),
    due: lines.filter((l) => l.kind === "previous"),
    payments: paymentRows,
    paidHerePaisa,
    ...st,
    isLatest,
    latestCode: latest?.code ?? null,
    meal: settlement[0] ?? null,
    accounts,
  };
}
export type TokenView = Awaited<ReturnType<typeof getTokenView>>;

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

export type PrintableToken = {
  id: string;
  code: string | null;
  period: Period;
  kind: "monthly" | "admission";
  studentName: string;
  studentCode: string;
  buildingCode: string;
  seatText: string;
  currentTotalPaisa: number;
  previousTotalPaisa: number;
  totalPaisa: number;
  current: { label: string; detail: string | null; amountPaisa: number }[];
  previous: { label: string; detail: string | null; amountPaisa: number }[];
  payments: { paidDate: string; amountPaisa: number; accountName: string; trxId: string | null }[];
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
      code: tokens.code,
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
  const [lines, paid, accounts] = await Promise.all([
    ids.length
      ? db().select().from(tokenLines).where(inArray(tokenLines.tokenId, ids)).orderBy(asc(tokenLines.sort))
      : Promise.resolve([]),
    ids.length
      ? db()
          .select({
            tokenId: payments.tokenId,
            paidDate: payments.paidDate,
            amountPaisa: payments.amountPaisa,
            accountName: paymentAccounts.name,
            trxId: payments.trxId,
          })
          .from(payments)
          .innerJoin(paymentAccounts, eq(paymentAccounts.id, payments.accountId))
          .where(and(inArray(payments.tokenId, ids), isNull(payments.voidedAt)))
          .orderBy(asc(payments.createdAt))
      : Promise.resolve([]),
    db()
      .select({ name: paymentAccounts.name, details: paymentAccounts.details, method: paymentAccounts.method })
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.orgId, actor.orgId), eq(paymentAccounts.isActive, true)))
      .orderBy(asc(paymentAccounts.method), asc(paymentAccounts.name)),
  ]);

  return {
    tokens: rows.map((r) => ({
      ...r,
      buildingCode: r.buildingCode ?? "",
      seatText: (r.seatText ?? "").replace(/^.*? · /, ""),
      current: lines.filter((l) => l.tokenId === r.id && l.kind === "current"),
      previous: lines.filter((l) => l.tokenId === r.id && l.kind === "previous"),
      payments: paid.filter((p) => p.tokenId === r.id),
    })),
    accounts: accounts.filter((a) => a.method !== "cash").map((a) => ({ name: a.name, details: a.details })),
  };
}
