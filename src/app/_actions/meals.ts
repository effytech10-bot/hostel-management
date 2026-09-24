"use server";

import { revalidatePath } from "next/cache";
import { holidayIdSchema, holidaySchema, mealDaySchema } from "@/lib/validation/meals";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { addHolidays, deleteHoliday, saveMealDay } from "@/server/services/meals";

function refresh() {
  revalidatePath("/admin/meals", "layout");
  revalidatePath("/cashier/meals", "layout");
}

function parsePayload(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return null;
  }
}

export async function saveMealDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "cashier");
  const { state, value } = await runForm(mealDaySchema, parsePayload(formData), (d) => saveMealDay(actor, d));
  if (!value) return state;
  refresh();
  return { ok: true, message: `Saved. ${value.offCount} meal(s) OFF for this day.` };
}

export async function addHolidayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const input = { ...formToObject(formData), slots: formData.getAll("slots") };
  const { state, value } = await runForm(holidaySchema, input, (d) => addHolidays(actor, d));
  if (value === undefined) return state;
  refresh();
  return { ok: true, message: `Added ${value} holiday meal(s).` };
}

export async function deleteHolidayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(holidayIdSchema, formToObject(formData), (d) => deleteHoliday(actor, d.holidayId));
  if (state.ok) refresh();
  return state;
}
