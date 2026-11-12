"use server";

import { revalidatePath } from "next/cache";
import { financeEntrySchema, voidFinanceEntrySchema } from "@/lib/validation/finance";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { createFinanceEntry, voidFinanceEntry, type SavedEntry } from "@/server/services/finance";

export type EntryState = ActionState & { saved?: SavedEntry };

export async function createFinanceEntryAction(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const actor = await requireRole("admin");
  const { state, value } = await runForm(financeEntrySchema, formToObject(formData), (d) =>
    createFinanceEntry(actor, d),
  );
  if (!value) return state;
  revalidatePath("/admin/finance");
  return { ok: true, saved: value, message: `Saved. Voucher ${value.voucherNo}.` };
}

export async function voidFinanceEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(voidFinanceEntrySchema, formToObject(formData), (d) => voidFinanceEntry(actor, d));
  if (!state.ok) return state;
  revalidatePath("/admin/finance");
  return { ok: true, message: "Cancelled. The money is back in the account." };
}
