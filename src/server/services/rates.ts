import "server-only";
import { and, desc, eq, lte } from "drizzle-orm";
import { currentPeriod, previousPeriod, type Period } from "@/lib/dates";
import type { RatesInput } from "@/lib/validation/rates";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db, type DbOrTx } from "@/server/db/client";
import { billingRates, type BillingRates } from "@/server/db/schema";
import type { Rates } from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { assertPeriodOpen } from "./periods";

/** Suggested starting values (from the client's brief). Only used to pre-fill the first form. */
export const SUGGESTED_RATES: Rates = {
  breakfastRatePaisa: 2750,
  lunchRatePaisa: 5500,
  dinnerRatePaisa: 5500,
  mealDepositPaisa: 420000,
  baburchiPaisa: 40000,
  serviceChargePaisa: 600000,
  serviceChargeThisMonth: false,
  advanceMonths: 2,
  midMonthRule: "prorata",
};

export function toRates(row: BillingRates): Rates {
  return {
    breakfastRatePaisa: row.breakfastRatePaisa,
    lunchRatePaisa: row.lunchRatePaisa,
    dinnerRatePaisa: row.dinnerRatePaisa,
    mealDepositPaisa: row.mealDepositPaisa,
    baburchiPaisa: row.baburchiPaisa,
    serviceChargePaisa: row.serviceChargePaisa,
    serviceChargeThisMonth: row.serviceChargeThisMonth,
    advanceMonths: row.advanceMonths,
    midMonthRule: row.midMonthRule,
  };
}

/**
 * Rates that apply to `period`: that month's own row, or the latest earlier month.
 * "Service charge this month" is NOT carried forward: it is only true on the month where it was ticked.
 */
export async function getEffectiveRates(
  tx: DbOrTx,
  orgId: string,
  period: Period,
): Promise<{ rates: Rates; fromPeriod: Period; row: BillingRates } | null> {
  const [row] = await tx
    .select()
    .from(billingRates)
    .where(and(eq(billingRates.orgId, orgId), lte(billingRates.period, period)))
    .orderBy(desc(billingRates.period))
    .limit(1);
  if (!row) return null;
  const rates = toRates(row);
  if (row.period !== period) rates.serviceChargeThisMonth = false;
  return { rates, fromPeriod: row.period, row };
}

export async function listRateHistory(actor: SessionUser) {
  assertRole(actor, "admin");
  return db()
    .select()
    .from(billingRates)
    .where(eq(billingRates.orgId, actor.orgId))
    .orderBy(desc(billingRates.period))
    .limit(36);
}

/** The oldest month whose rates can still be changed. Month closing (billing) will lock earlier months. */
export function earliestEditablePeriod(): Period {
  return previousPeriod(currentPeriod());
}

export async function saveRates(actor: SessionUser, input: RatesInput): Promise<void> {
  assertRole(actor, "admin");
  if (input.period < earliestEditablePeriod()) {
    throw new AppError("VALIDATION", `Rates for ${input.period} can no longer be changed.`);
  }
  await assertPeriodOpen(db(), actor.orgId, input.period);

  const values = {
    breakfastRatePaisa: input.breakfastRate,
    lunchRatePaisa: input.lunchRate,
    dinnerRatePaisa: input.dinnerRate,
    mealDepositPaisa: input.mealDeposit,
    baburchiPaisa: input.baburchi,
    serviceChargePaisa: input.serviceCharge,
    serviceChargeThisMonth: input.serviceChargeThisMonth,
    advanceMonths: input.advanceMonths,
    midMonthRule: input.midMonthRule,
    notes: input.notes,
    updatedBy: actor.membershipId,
  };

  await db().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(billingRates)
      .where(and(eq(billingRates.orgId, actor.orgId), eq(billingRates.period, input.period)))
      .limit(1);
    const [after] = await tx
      .insert(billingRates)
      .values({ orgId: actor.orgId, period: input.period, ...values })
      .onConflictDoUpdate({ target: [billingRates.orgId, billingRates.period], set: values })
      .returning();
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: before ? "rates.update" : "rates.create",
      entityType: "billing_rates",
      entityId: after.id,
      before: before ?? null,
      after,
    });
  });
}
