"use client";

import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatTaka } from "@/lib/money";
import type { Rates } from "@/server/domain/billing";
import type { ActionState } from "@/server/errors";
import { saveRatesAction } from "./actions";

const taka = (p: number) => formatTaka(p, { symbol: false });

export function RatesForm({ period, defaults, locked }: { period: string; defaults: Rates; locked: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveRatesAction, {});
  const e = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="period" value={period} />
      <fieldset disabled={locked} className="flex flex-col gap-6">
        <div>
          <p className="mb-3 text-sm font-semibold">Meal rates (per meal)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="breakfastRate"
              label="Breakfast (৳)"
              inputMode="decimal"
              defaultValue={taka(defaults.breakfastRatePaisa)}
              required
              errors={e}
            />
            <Field
              name="lunchRate"
              label="Lunch (৳)"
              inputMode="decimal"
              defaultValue={taka(defaults.lunchRatePaisa)}
              required
              errors={e}
            />
            <Field
              name="dinnerRate"
              label="Dinner (৳)"
              inputMode="decimal"
              defaultValue={taka(defaults.dinnerRatePaisa)}
              required
              errors={e}
            />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold">Monthly charges (per student)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="mealDeposit"
              label="Meal deposit (৳)"
              inputMode="decimal"
              defaultValue={taka(defaults.mealDepositPaisa)}
              hint="On every token; meals eaten minus this deposit shows as Pre meal on the next token"
              required
              errors={e}
            />
            {/* Baburchi is covered by the meal rates (meal deposit + pre meal). */}
            <input type="hidden" name="baburchi" value="0" />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold">Service charge & advance</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="serviceCharge"
              label="Service charge (৳)"
              hint="One time, on the admission token only"
              inputMode="decimal"
              defaultValue={taka(defaults.serviceChargePaisa)}
              required
              errors={e}
            />
            <Field
              name="advanceMonths"
              label="Advance at admission (months of rent)"
              inputMode="numeric"
              defaultValue={String(defaults.advanceMonths)}
              required
              errors={e}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:max-w-md">
          <Label htmlFor="midMonthRule">Leaving in the middle of the month</Label>
          <Select id="midMonthRule" name="midMonthRule" defaultValue={defaults.midMonthRule}>
            <option value="prorata">Charge only the days stayed</option>
            <option value="full">Charge the full month</option>
          </Select>
        </div>

        <Field name="notes" label="Notes" placeholder="Why the rates changed (optional)" errors={e} />
      </fieldset>

      <div className="flex flex-col gap-3">
        <FormMessage error={state.error} message={state.message} />
        {!locked && (
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Saving…" : "Save rates for this month"}
          </Button>
        )}
      </div>
    </form>
  );
}
