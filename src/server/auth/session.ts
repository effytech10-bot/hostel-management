import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db/client";
import { memberships, organizations } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { homePathFor, type MemberRole } from "./roles";

export type SessionUser = {
  userId: string;
  membershipId: string;
  orgId: string;
  orgName: string;
  role: MemberRole;
  fullName: string;
  phone: string;
  mustChangePassword: boolean;
};

/**
 * The logged-in user with their organization and role, or null.
 * Cached per request, so calling it many times costs one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const rows = await db()
    .select({
      membershipId: memberships.id,
      orgId: memberships.orgId,
      orgName: organizations.name,
      role: memberships.role,
      fullName: memberships.fullName,
      phone: memberships.phone,
      mustChangePassword: memberships.mustChangePassword,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, data.user.id), eq(memberships.isActive, true)))
    .limit(2);

  // Phase 1: one active membership per login.
  if (rows.length !== 1) return null;
  return { userId: data.user.id, ...rows[0] };
});

/**
 * For pages and layouts: redirect to /login when not logged in,
 * and to /change-password while the person still uses a password someone else gave them.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/** For pages and layouts: send users with another role to their own home. */
export async function requireRole(...roles: MemberRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}

/** For server actions and services: throw instead of redirecting. */
export function assertRole(user: SessionUser, ...roles: MemberRole[]): void {
  if (!roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  }
}
