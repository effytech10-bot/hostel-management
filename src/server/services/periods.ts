import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { formatPeriod, periodOf, type DateString, type Period } from "@/lib/dates";
import type { DbOrTx } from "@/server/db/client";
import { billingPeriods } from "@/server/db/schema";
import { AppError } from "@/server/errors";

/** The latest closed month, or null. Every month up to and including it is locked. */
export async function latestClosedPeriod(tx: DbOrTx, orgId: string): Promise<Period | null> {
  const [row] = await tx
    .select({ period: billingPeriods.period })
    .from(billingPeriods)
    .where(and(eq(billingPeriods.orgId, orgId), isNotNull(billingPeriods.closedAt)))
    .orderBy(desc(billingPeriods.period))
    .limit(1);
  return row?.period ?? null;
}

export async function isPeriodLocked(tx: DbOrTx, orgId: string, period: Period): Promise<boolean> {
  const latest = await latestClosedPeriod(tx, orgId);
  return latest !== null && period <= latest;
}

/** Throw a readable error when `period` (or the month of a date) is already closed. */
export async function assertPeriodOpen(tx: DbOrTx, orgId: string, periodOrDate: Period | DateString): Promise<void> {
  const period = periodOrDate.length > 7 ? periodOf(periodOrDate) : periodOrDate;
  if (await isPeriodLocked(tx, orgId, period)) {
    throw new AppError(
      "VALIDATION",
      `${formatPeriod(period)} is closed. Changes for a closed month go into the current month as an adjustment.`,
    );
  }
}
