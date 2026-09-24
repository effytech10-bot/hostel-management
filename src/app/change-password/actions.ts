"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { changePasswordSchema } from "@/lib/validation/password";
import { writeAudit } from "@/server/audit";
import { homePathFor } from "@/server/auth/roles";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { memberships } from "@/server/db/schema";
import { newPasswordError } from "@/server/domain/passwords";
import type { ActionState } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase/server";

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // getSessionUser, not requireUser: this page must work while mustChangePassword is still true.
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please check the fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const weak = newPasswordError(parsed.data.password, user.phone);
  if (weak) return { error: weak, fieldErrors: { password: [weak] } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error: /different from the old/i.test(error.message)
        ? "The new password must be different from the current one."
        : `Could not change the password: ${error.message}`,
    };
  }

  await db().update(memberships).set({ mustChangePassword: false }).where(eq(memberships.id, user.membershipId));
  await writeAudit(db(), {
    orgId: user.orgId,
    actorMembershipId: user.membershipId,
    action: "membership.change_own_password",
    entityType: "membership",
    entityId: user.membershipId,
  });

  redirect(homePathFor(user.role));
}
