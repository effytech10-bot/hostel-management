"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cashierBuildingsSchema } from "@/lib/validation/buildings";
import { createStaffSchema, resetPasswordSchema } from "@/lib/validation/members";
import { requireRole } from "@/server/auth/session";
import { toActionError, type ActionState } from "@/server/errors";
import { runForm } from "@/server/forms";
import { setCashierBuildings } from "@/server/services/buildings";
import { createStaffMember, resetMemberPassword } from "@/server/services/members";

export async function createStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    await createStaffMember(actor, parsed.data);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true, message: `${parsed.data.fullName} can now log in with ${parsed.data.phone}.` };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors.password?.[0] ?? "Invalid input." };
  }
  try {
    await resetMemberPassword(actor, parsed.data);
  } catch (error) {
    return toActionError(error);
  }
  return { ok: true, message: "Password updated." };
}

export async function setCashierBuildingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const input = {
    membershipId: formData.get("membershipId"),
    buildingIds: formData.getAll("buildingIds"),
  };
  const { state } = await runForm(cashierBuildingsSchema, input, (d) => setCashierBuildings(actor, d));
  if (state.ok) revalidatePath("/admin/users");
  return state.ok ? { ok: true, message: "Saved." } : state;
}
