"use server";

import { revalidatePath } from "next/cache";
import { leaveSchema, refundSchema } from "@/lib/validation/leave";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { confirmLeave, previewLeave, recordRefund, type LeaveStatement } from "@/server/services/leave";

function refresh() {
  revalidatePath("/", "layout");
}

export type LeaveState = ActionState & { statement?: LeaveStatement; confirmed?: boolean };

export async function leaveAction(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  const actor = await requireRole("admin");
  const confirm = formData.get("intent") === "confirm";
  const { state, value } = await runForm(leaveSchema, formToObject(formData), (d) =>
    confirm ? confirmLeave(actor, d) : previewLeave(actor, d),
  );
  if (!value) return state;
  if (confirm) refresh();
  return { ok: true, statement: value, confirmed: confirm };
}

export async function refundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(refundSchema, formToObject(formData), (d) => recordRefund(actor, d));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Refund recorded." } : state;
}
