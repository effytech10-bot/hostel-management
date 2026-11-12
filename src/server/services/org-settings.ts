import "server-only";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db, type DbOrTx } from "@/server/db/client";
import { organizations } from "@/server/db/schema";
import { FUND_ORDERS, parseFundOrder, type Fund } from "@/server/domain/finance";
import { MEAL_CUTOFF_HOURS } from "@/server/domain/meals";
import { AppError } from "@/server/errors";

/** Hour (hostel time, day before the meal) until which students can change their own meals; null = office only. */
export async function getMealCutoffHour(tx: DbOrTx, orgId: string): Promise<number | null> {
  const [row] = await tx
    .select({ hour: organizations.mealCutoffHour })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.hour ?? null;
}

/** Which account a payment fills first when only the total is typed. */
export async function getPaymentOrder(tx: DbOrTx, orgId: string): Promise<Fund[]> {
  const [row] = await tx
    .select({ order: organizations.paymentOrder })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return parseFundOrder(row?.order);
}

export async function savePaymentOrder(actor: SessionUser, order: string): Promise<void> {
  assertRole(actor, "admin");
  if (!(FUND_ORDERS as readonly string[]).includes(order)) {
    throw new AppError("VALIDATION", "Choose one of the listed orders.");
  }
  await db().transaction(async (tx) => {
    const before = (await getPaymentOrder(tx, actor.orgId)).join(",");
    await tx.update(organizations).set({ paymentOrder: order }).where(eq(organizations.id, actor.orgId));
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "settings.payment_order",
      entityType: "organization",
      entityId: actor.orgId,
      before: { paymentOrder: before },
      after: { paymentOrder: order },
    });
  });
}

export async function saveMealCutoffHour(actor: SessionUser, hour: number | null): Promise<void> {
  assertRole(actor, "admin");
  if (hour !== null && !(MEAL_CUTOFF_HOURS as readonly number[]).includes(hour)) {
    throw new AppError("VALIDATION", "Choose one of the listed times.");
  }
  await db().transaction(async (tx) => {
    const before = await getMealCutoffHour(tx, actor.orgId);
    await tx.update(organizations).set({ mealCutoffHour: hour }).where(eq(organizations.id, actor.orgId));
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "settings.meal_cutoff",
      entityType: "organization",
      entityId: actor.orgId,
      before: { mealCutoffHour: before },
      after: { mealCutoffHour: hour },
    });
  });
}
