import "server-only";
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DateString } from "@/lib/dates";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  auditLogs,
  buildings,
  memberships,
  paymentAccounts,
  payments,
  refunds,
  rooms,
  seats,
  students,
  tokens,
} from "@/server/db/schema";
import {
  AUDIT_CATEGORIES,
  describeAudit,
  idsNeeded,
  type AuditLookups,
  type AuditRow,
  type AuditView,
} from "@/server/domain/audit-text";

export const AUDIT_PAGE_SIZE = 60;

export type AuditFilters = {
  /** Category key from AUDIT_CATEGORIES. */
  cat?: string;
  /** "system", "students" or a staff membership id. */
  who?: string;
  from?: DateString;
  to?: DateString;
  /** Student name, Student ID or phone. */
  q?: string;
  page?: number;
};

export type AuditEntry = AuditView & {
  id: string;
  at: Date;
  actor: { name: string; role: "admin" | "cashier" | "student" | "system" };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** WHERE parts for the filters. Returns null when the student search matches nobody. */
async function whereFor(actor: SessionUser, f: AuditFilters): Promise<SQL[] | null> {
  const where: SQL[] = [eq(auditLogs.orgId, actor.orgId)];

  const cat = AUDIT_CATEGORIES.find((c) => c.key === f.cat);
  if (cat) where.push(or(...cat.prefixes.map((p) => ilike(auditLogs.action, `${p}%`)))!);

  if (f.who === "system") where.push(isNull(auditLogs.actorMembershipId));
  else if (f.who === "students") where.push(eq(memberships.role, "student"));
  else if (f.who && UUID_RE.test(f.who)) where.push(eq(auditLogs.actorMembershipId, f.who));

  if (f.from) where.push(sql`${auditLogs.createdAt} >= (${f.from}::date)::timestamp at time zone 'Asia/Dhaka'`);
  if (f.to) where.push(sql`${auditLogs.createdAt} < (${f.to}::date + 1)::timestamp at time zone 'Asia/Dhaka'`);

  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const found = await db()
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.orgId, actor.orgId),
          or(
            ilike(students.fullName, `%${q.replace(/[%_\\]/g, "")}%`),
            eq(students.studentCode, q),
            digits.length >= 6 ? ilike(students.phone, `%${digits}%`) : undefined,
          ),
        ),
      )
      .limit(50);
    if (found.length === 0) return null;
    const ids = found.map((s) => s.id);
    const [payRows, refundRows] = await Promise.all([
      db().select({ id: payments.id }).from(payments).where(inArray(payments.studentId, ids)),
      db().select({ id: refunds.id }).from(refunds).where(inArray(refunds.studentId, ids)),
    ]);
    const entityIds = [...ids, ...payRows.map((p) => p.id), ...refundRows.map((r) => r.id)];
    const idList = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );
    where.push(
      or(
        inArray(auditLogs.entityId, entityIds),
        sql`${auditLogs.after}->>'studentId' in (${idList})`,
        sql`${auditLogs.before}->>'studentId' in (${idList})`,
        ...ids.map((id) => sql`${auditLogs.after}->'offs' @> ${JSON.stringify([{ studentId: id }])}::jsonb`),
      )!,
    );
  }
  return where;
}

async function lookupsFor(orgId: string, rows: AuditRow[], area: string): Promise<AuditLookups> {
  const need = idsNeeded(rows);
  const L: AuditLookups = {
    students: new Map(),
    payments: new Map(),
    buildings: new Map(),
    rooms: new Map(),
    seats: new Map(),
    members: new Map(),
    accounts: new Map(),
    area,
  };

  if (need.payments.size) {
    const rows = await db()
      .select({
        id: payments.id,
        studentId: payments.studentId,
        amountPaisa: payments.amountPaisa,
        receiptNo: payments.receiptNo,
        tokenCode: tokens.code,
      })
      .from(payments)
      .leftJoin(tokens, eq(tokens.id, payments.tokenId))
      .where(and(eq(payments.orgId, orgId), inArray(payments.id, [...need.payments])));
    for (const r of rows) {
      L.payments.set(r.id, r);
      need.students.add(r.studentId);
    }
  }
  if (need.seats.size) {
    const rows = await db()
      .select({ id: seats.id, label: seats.label, roomId: seats.roomId })
      .from(seats)
      .where(and(eq(seats.orgId, orgId), inArray(seats.id, [...need.seats])));
    for (const r of rows) {
      L.seats.set(r.id, { label: r.label, roomId: r.roomId });
      need.rooms.add(r.roomId);
    }
  }
  if (need.rooms.size) {
    const rows = await db()
      .select({ id: rooms.id, number: rooms.number, buildingId: rooms.buildingId })
      .from(rooms)
      .where(and(eq(rooms.orgId, orgId), inArray(rooms.id, [...need.rooms])));
    for (const r of rows) {
      L.rooms.set(r.id, { number: r.number, buildingId: r.buildingId });
      need.buildings.add(r.buildingId);
    }
  }

  await Promise.all([
    need.students.size &&
      db()
        .select({ id: students.id, name: students.fullName, code: students.studentCode })
        .from(students)
        .where(and(eq(students.orgId, orgId), inArray(students.id, [...need.students])))
        .then((rs) => rs.forEach((r) => L.students.set(r.id, { name: r.name, code: r.code }))),
    need.buildings.size &&
      db()
        .select({ id: buildings.id, code: buildings.code })
        .from(buildings)
        .where(and(eq(buildings.orgId, orgId), inArray(buildings.id, [...need.buildings])))
        .then((rs) => rs.forEach((r) => L.buildings.set(r.id, r.code))),
    need.members.size &&
      db()
        .select({ id: memberships.id, name: memberships.fullName, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), inArray(memberships.id, [...need.members])))
        .then((rs) => rs.forEach((r) => L.members.set(r.id, { name: r.name, role: r.role }))),
    need.accounts.size &&
      db()
        .select({ id: paymentAccounts.id, name: paymentAccounts.name })
        .from(paymentAccounts)
        .where(and(eq(paymentAccounts.orgId, orgId), inArray(paymentAccounts.id, [...need.accounts])))
        .then((rs) => rs.forEach((r) => L.accounts.set(r.id, r.name))),
  ]);
  return L;
}

/** The activity log in plain words, newest first (admin only). */
export async function listAuditEntries(
  actor: SessionUser,
  filters: AuditFilters,
  area: string,
  pageSize = AUDIT_PAGE_SIZE,
): Promise<{ entries: AuditEntry[]; hasMore: boolean; page: number }> {
  assertRole(actor, "admin");
  const page = Math.max(1, filters.page ?? 1);
  const where = await whereFor(actor, filters);
  if (!where) return { entries: [], hasMore: false, page };

  const rows = await db()
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      before: auditLogs.before,
      after: auditLogs.after,
      actorId: auditLogs.actorMembershipId,
      actorName: memberships.fullName,
      actorRole: memberships.role,
    })
    .from(auditLogs)
    .leftJoin(memberships, eq(memberships.id, auditLogs.actorMembershipId))
    .where(and(...where))
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);

  const shown = rows.slice(0, pageSize);
  const L = await lookupsFor(actor.orgId, shown, area);
  return {
    entries: shown.map((r) => ({
      id: r.id,
      at: r.createdAt,
      actor: r.actorId
        ? { name: r.actorName ?? "মুছে ফেলা ইউজার", role: (r.actorRole ?? "admin") as "admin" | "cashier" | "student" }
        : { name: "সিস্টেম (অটো)", role: "system" as const },
      ...describeAudit(r, L),
    })),
    hasMore: rows.length > pageSize,
    page,
  };
}

/** How many of each kind, for the summary tiles (same filters, without the category). */
export async function auditSummary(actor: SessionUser, filters: AuditFilters) {
  assertRole(actor, "admin");
  const where = await whereFor(actor, { ...filters, cat: undefined });
  const empty = { total: 0, payments: 0, voids: 0, admits: 0, leaves: 0 };
  if (!where) return empty;
  const rows = await db()
    .select({ action: auditLogs.action, n: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLogs)
    .leftJoin(memberships, eq(memberships.id, auditLogs.actorMembershipId))
    .where(and(...where))
    .groupBy(auditLogs.action);
  const n = (a: string) => rows.find((r) => r.action === a)?.n ?? 0;
  return {
    total: rows.reduce((s, r) => s + r.n, 0),
    payments: n("payment.create"),
    voids: n("payment.void"),
    admits: n("student.admit") + n("student.import"),
    leaves: n("student.leave"),
  };
}

/** People who can appear in the "who did it" filter. */
export async function auditPeople(actor: SessionUser) {
  assertRole(actor, "admin");
  return db()
    .select({ id: memberships.id, name: memberships.fullName, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, actor.orgId), inArray(memberships.role, ["admin", "cashier"])))
    .orderBy(memberships.role, memberships.fullName);
}
