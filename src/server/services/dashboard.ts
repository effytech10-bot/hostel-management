import "server-only";
import { count, eq } from "drizzle-orm";
import { currentPeriod, dhakaDate, periodStart, previousPeriod } from "@/lib/dates";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { memberships } from "@/server/db/schema";
import type { MemberRole } from "@/server/auth/roles";
import { listBuildings } from "./buildings";
import { latestClosedPeriod } from "./periods";
import { balanceReport, collectionSummary } from "./reports";
import { listTokens } from "./tokens";

export async function countMembersByRole(actor: SessionUser): Promise<Record<MemberRole, number>> {
  const rows = await db()
    .select({ role: memberships.role, total: count() })
    .from(memberships)
    .where(eq(memberships.orgId, actor.orgId))
    .groupBy(memberships.role);

  const result: Record<MemberRole, number> = { admin: 0, cashier: 0, student: 0 };
  for (const row of rows) result[row.role] = row.total;
  return result;
}

/** Everything the admin / cashier home screen shows. Cashiers get only their buildings. */
export async function getDashboard(actor: SessionUser) {
  assertRole(actor, "admin", "cashier");
  const today = dhakaDate();
  const period = currentPeriod();
  const [dues, formerDues, collectedToday, collectedMonth, monthTokens, lastClosed, buildingList] = await Promise.all([
    balanceReport(actor, { status: "active", show: "due" }),
    balanceReport(actor, { status: "left", show: "due" }),
    collectionSummary(actor, { from: today, to: today }),
    collectionSummary(actor, { from: periodStart(period), to: today }),
    listTokens(actor, period),
    latestClosedPeriod(db(), actor.orgId),
    listBuildings(actor),
  ]);

  const tokenCounts = { total: monthTokens.length, paid: 0, partial: 0, unpaid: 0, remainingPaisa: 0 };
  for (const t of monthTokens) {
    tokenCounts[t.status]++;
    tokenCounts.remainingPaisa += t.remainingPaisa;
  }

  const duesByCode = new Map(dues.byBuilding.map((b) => [b.buildingCode, b]));
  const collectedByCode = new Map(collectedMonth.byBuilding.map((b) => [b.buildingCode, b.totalPaisa]));
  const buildingRows = buildingList
    .filter((b) => b.isActive || b.occupied > 0)
    .map((b) => ({
      id: b.id,
      code: b.code,
      seats: b.seats,
      occupied: b.occupied,
      vacant: Math.max(0, b.seats - b.occupied - b.reserved),
      students: duesByCode.get(b.code)?.students ?? 0,
      withDue: duesByCode.get(b.code)?.withDue ?? 0,
      duePaisa: duesByCode.get(b.code)?.duePaisa ?? 0,
      collectedMonthPaisa: collectedByCode.get(b.code) ?? 0,
    }));

  const previous = previousPeriod(period);
  return {
    today,
    period,
    collectedToday: { totalPaisa: collectedToday.totalPaisa, count: collectedToday.count },
    collectedMonth: { totalPaisa: collectedMonth.totalPaisa, count: collectedMonth.count },
    dues: dues.totals,
    formerDues: formerDues.totals,
    tokens: tokenCounts,
    monthEnd: {
      lastClosed,
      /** The previous month should be closed (meal settlement + this month's tokens). */
      needsClosing: lastClosed === null ? null : lastClosed < previous ? previous : null,
      neverRun: lastClosed === null,
    },
    buildings: buildingRows,
    occupancy: buildingRows.reduce(
      (t, b) => ({ seats: t.seats + b.seats, occupied: t.occupied + b.occupied, vacant: t.vacant + b.vacant }),
      { seats: 0, occupied: 0, vacant: 0 },
    ),
  };
}
