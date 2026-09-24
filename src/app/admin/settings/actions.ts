"use server";

import { revalidatePath } from "next/cache";
import { mealCutoffSchema } from "@/lib/validation/meals";
import { ratesSchema } from "@/lib/validation/rates";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { saveMealCutoffHour } from "@/server/services/org-settings";
import { saveRates } from "@/server/services/rates";

export async function saveRatesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(ratesSchema, formToObject(formData), (d) => saveRates(actor, d));
  if (!state.ok) return state;
  revalidatePath("/admin/settings");
  return { ok: true, message: "Rates saved." };
}

export async function saveMealCutoffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(mealCutoffSchema, formToObject(formData), (d) =>
    saveMealCutoffHour(actor, d.cutoffHour),
  );
  if (!state.ok) return state;
  revalidatePath("/admin/settings");
  revalidatePath("/student", "layout");
  return { ok: true, message: "Saved." };
}
