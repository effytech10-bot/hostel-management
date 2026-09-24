"use server";

import { revalidatePath } from "next/cache";
import { dailyMealSchema, myMealsSchema } from "@/lib/validation/meals";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { formatDate } from "@/lib/dates";
import { MEAL_SLOT_LABEL } from "@/server/domain/meals";
import { setMyDailyMeal, setMyMeals } from "@/server/services/student-portal";

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
    message += ` ${value.officeKept} meal(s) were set by the office and were not changed. Ask the office.`;
  }
  return { ok: true, message };
}

/** The "every day" switch (e.g. no breakfast every day from tomorrow). */
export async function setMyDailyMealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("student");
  const { state, value } = await runForm(dailyMealSchema, formToObject(formData), (d) => setMyDailyMeal(actor, d));
  if (!value) return state;
  revalidatePath("/student", "layout");
  const on = formData.get("on") === "true";
  const slot = MEAL_SLOT_LABEL[formData.get("slot") as keyof typeof MEAL_SLOT_LABEL] ?? "Meal";
  return {
    ok: true,
    message: `${slot} is ${on ? "ON" : "OFF"} every day from ${formatDate(value.from)}. You can still change single days below.`,
  };
}
