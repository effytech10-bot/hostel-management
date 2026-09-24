import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import type { CreateStaffInput, ResetPasswordInput } from "@/lib/validation/members";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { memberships } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { supabaseAdmin } from "@/server/supabase/admin";

/** Internal login email. Users never see it; they log in with their phone number. */
export function makeAuthEmail(): string {
  return `u-${randomUUID()}@${env().AUTH_EMAIL_DOMAIN}`;
}

export async function listStaff(actor: SessionUser) {
  assertRole(actor, "admin");
  return db()
    .select({
      id: memberships.id,
      fullName: memberships.fullName,
      phone: memberships.phone,
      role: memberships.role,
      isActive: memberships.isActive,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .where(and(eq(memberships.orgId, actor.orgId), ne(memberships.role, "student")))
    .orderBy(asc(memberships.role), asc(memberships.fullName));
}

/** Create an admin or cashier login. Input must already be validated with createStaffSchema. */
export async function createStaffMember(actor: SessionUser, input: CreateStaffInput): Promise<string> {
  assertRole(actor, "admin");

  const existing = await db()
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.phone, input.phone)))
    .limit(1);
  if (existing.length > 0) throw new AppError("CONFLICT", "This phone number is already registered.");

  const authEmail = makeAuthEmail();
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    throw new AppError("AUTH", `Could not create the login: ${error?.message ?? "unknown error"}`);
  }
  const userId = data.user.id;

  try {
    return await db().transaction(async (tx) => {
      const [created] = await tx
        .insert(memberships)
        .values({
          orgId: actor.orgId,
          userId,
          role: input.role,
          fullName: input.fullName,
          phone: input.phone,
          authEmail,
          mustChangePassword: true,
        })
        .returning({ id: memberships.id });

      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "membership.create",
        entityType: "membership",
        entityId: created.id,
        after: { role: input.role, fullName: input.fullName, phone: input.phone },
      });
      return created.id;
    });
  } catch (err) {
    // Keep Supabase Auth and our database in sync: remove the orphan login.
    await supabaseAdmin().auth.admin.deleteUser(userId);
    throw err;
  }
}

export async function resetMemberPassword(actor: SessionUser, input: ResetPasswordInput): Promise<void> {
  assertRole(actor, "admin");

  const [member] = await db()
    .select({ id: memberships.id, userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.id, input.membershipId), eq(memberships.orgId, actor.orgId)))
    .limit(1);
  if (!member) throw new AppError("NOT_FOUND", "User not found.");

  const { error } = await supabaseAdmin().auth.admin.updateUserById(member.userId, {
    password: input.password,
  });
  if (error) throw new AppError("AUTH", `Could not reset the password: ${error.message}`);
  await db().update(memberships).set({ mustChangePassword: true }).where(eq(memberships.id, member.id));

  await writeAudit(db(), {
    orgId: actor.orgId,
    actorMembershipId: actor.membershipId,
    action: "membership.reset_password",
    entityType: "membership",
    entityId: member.id,
  });
}
