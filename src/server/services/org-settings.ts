import "server-only";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db, type DbOrTx } from "@/server/db/client";
import { organizations } from "@/server/db/schema";
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
