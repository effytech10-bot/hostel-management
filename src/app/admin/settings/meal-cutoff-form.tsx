"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatHour, MEAL_CUTOFF_HOURS } from "@/server/domain/meals";
import type { ActionState } from "@/server/errors";
import { saveMealCutoffAction } from "./actions";

export function MealCutoffForm({ cutoffHour }: { cutoffHour: number | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveMealCutoffAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-col gap-1.5">
        <Label htmlFor="cutoffHour">Students can turn meals on/off until</Label>
        <Select id="cutoffHour" name="cutoffHour" defaultValue={cutoffHour === null ? "" : String(cutoffHour)}>
          {MEAL_CUTOFF_HOURS.map((h) => (
            <option key={h} value={h}>
              {formatHour(h)} the night before
            </option>
          ))}
          <option value="">Not allowed (only the office changes meals)</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormMessage error={state.error} message={state.message} className="py-1" />
    </form>
  );
}
