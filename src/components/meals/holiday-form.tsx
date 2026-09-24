"use client";

import { useActionState } from "react";
import { addHolidayAction } from "@/app/_actions/meals";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dhakaDate } from "@/lib/dates";
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from "@/server/domain/meals";
import type { ActionState } from "@/server/errors";

export function HolidayForm({ buildings }: { buildings: { id: string; code: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addHolidayAction, {});
  const e = state.fieldErrors;
  const today = dhakaDate();

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field name="from" label="From" type="date" defaultValue={today} required errors={e} />
      <Field name="to" label="To" type="date" defaultValue={today} required errors={e} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="holiday-building">Building</Label>
        <Select id="holiday-building" name="buildingId" defaultValue="">
          <option value="">All buildings</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Meals</span>
        <div className="flex h-10 items-center gap-4">
          {MEAL_SLOTS.map((slot) => (
            <label key={slot} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="slots" value={slot} defaultChecked />
              {MEAL_SLOT_LABEL[slot]}
            </label>
          ))}
        </div>
        <FieldError errors={e?.slots} />
      </div>
      <Field name="note" label="Note" placeholder="Eid-ul-Adha" errors={e} wrapperClassName="sm:col-span-2" />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Adding…" : "Add holiday"}
        </Button>
      </div>
    </form>
  );
}
