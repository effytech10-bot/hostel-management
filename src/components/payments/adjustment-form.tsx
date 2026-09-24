"use client";

import { useActionState } from "react";
import { adjustmentAction } from "@/app/_actions/payments";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { currentPeriod } from "@/lib/dates";
import { ADJUSTABLE_HEADS } from "@/lib/validation/payments";
import { HEAD_LABEL } from "@/server/domain/billing";
import type { ActionState } from "@/server/errors";

/** Admin only: opening balance, an extra charge, or a discount/waiver. */
export function AdjustmentForm({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adjustmentAction, {});
  const e = state.fieldErrors;
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="adj-direction">Type</Label>
        <Select id="adj-direction" name="direction" defaultValue="charge">
          <option value="charge">Add a due (charge, opening balance)</option>
          <option value="reduce">Reduce a due (discount, waiver, old credit)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adj-head">For</Label>
        <Select id="adj-head" name="head" defaultValue="rent">
          {ADJUSTABLE_HEADS.map((h) => (
            <option key={h} value={h}>
              {HEAD_LABEL[h]}
            </option>
          ))}
        </Select>
        <FieldError errors={e?.head} />
      </div>
      <Field name="period" label="Month" type="month" defaultValue={currentPeriod()} required errors={e} />
      <Field name="amount" label="Amount (৳)" inputMode="decimal" required errors={e} />
      <Field
        name="description"
        label="Reason"
        placeholder="e.g. Opening balance from Excel, August rent due"
        required
        errors={e}
        wrapperClassName="sm:col-span-2"
      />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" variant="outline" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Save adjustment"}
        </Button>
      </div>
    </form>
  );
}
