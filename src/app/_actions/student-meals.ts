"use server";

import { revalidatePath } from "next/cache";
import { myMealsSchema } from "@/lib/validation/meals";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { setMyMeals } from "@/server/services/student-portal";

/** A student turning their own meals on/off. The student is taken from the login, never from the form. */
export async function setMyMealsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("student");
  const input = { ...formToObject(formData), slots: formData.getAll("slots") };
  const { state, value } = await runForm(myMealsSchema, input, (d) => setMyMeals(actor, d));
  if (!value) return state;
  revalidatePath("/student", "layout");
  const on = formData.get("on") === "true";
  let message =
    value.changed === 0
      ? "Nothing to change. These meals were already like that."
      : `${value.changed} meal(s) turned ${on ? "ON" : "OFF"}.`;
  if (value.officeKept > 0) {
    message += ` ${value.officeKept} meal(s) were turned off by the office and stay off. Ask the office.`;
  }
  return { ok: true, message };
}
