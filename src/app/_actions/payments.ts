"use server";

import { revalidatePath } from "next/cache";
import {
  accountIdSchema,
  adjustmentSchema,
  paymentAccountSchema,
  paymentSchema,
  voidPaymentSchema,
} from "@/lib/validation/payments";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import {
  addAdjustment,
  createPaymentAccount,
  recordPayment,
  togglePaymentAccount,
  voidPayment,
  type RecordedPayment,
} from "@/server/services/payments";

function refresh() {
  for (const area of ["admin", "cashier"]) {
    revalidatePath(`/${area}/payments`, "layout");
    revalidatePath(`/${area}/students`, "layout");
  }
  revalidatePath("/receipts", "layout");
}

export type PaymentState = ActionState & { recorded?: RecordedPayment };

export async function recordPaymentAction(_prev: PaymentState, formData: FormData): Promise<PaymentState> {
  const actor = await requireRole("admin", "cashier");
  const { state, value } = await runForm(paymentSchema, formToObject(formData), (d) => recordPayment(actor, d));
  if (!value) return state;
  refresh();
  return { ok: true, recorded: value };
}

export async function voidPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(voidPaymentSchema, formToObject(formData), (d) => voidPayment(actor, d));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Payment voided. The money was put back on the student's account." } : state;
}

export async function adjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(adjustmentSchema, formToObject(formData), (d) => addAdjustment(actor, d));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Saved to the student's account." } : state;
}

export async function createPaymentAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(paymentAccountSchema, formToObject(formData), (d) => createPaymentAccount(actor, d));
  if (state.ok) revalidatePath("/admin/settings");
  return state.ok ? { ok: true, message: "Account added." } : state;
}

export async function togglePaymentAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(accountIdSchema, formToObject(formData), (d) =>
    togglePaymentAccount(actor, d.accountId),
  );
  if (state.ok) revalidatePath("/admin/settings");
  return state;
}
