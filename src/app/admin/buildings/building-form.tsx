"use client";

import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { formatTaka } from "@/lib/money";
import type { ActionState } from "@/server/errors";
import { createBuildingAction, updateBuildingAction } from "./actions";

export type BuildingFormValues = {
  id: string;
  code: string;
  name: string | null;
  address: string | null;
  landlordName: string | null;
  landlordPhone: string | null;
  landlordRentPaisa: number | null;
  notes: string | null;
};

export function BuildingForm({ building }: { building?: BuildingFormValues }) {
  const isEdit = !!building;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    isEdit ? updateBuildingAction : createBuildingAction,
    {},
  );
  const e = state.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {isEdit && <input type="hidden" name="buildingId" value={building.id} />}
      <Field
        name="code"
        label="Building number *"
        placeholder="207"
        defaultValue={building?.code}
        required
        errors={e}
      />
      <Field
        name="name"
        label="Name (optional)"
        placeholder="Rangdhanu 207"
        defaultValue={building?.name ?? ""}
        errors={e}
      />
      <Field
        name="address"
        label="Address"
        defaultValue={building?.address ?? ""}
        errors={e}
        wrapperClassName="sm:col-span-2"
      />
      <Field name="landlordName" label="Landlord name" defaultValue={building?.landlordName ?? ""} errors={e} />
      <Field
        name="landlordPhone"
        label="Landlord phone"
        type="tel"
        inputMode="tel"
        placeholder="01XXXXXXXXX"
        defaultValue={building?.landlordPhone ?? ""}
        errors={e}
      />
      <Field
        name="landlordRent"
        label="Monthly rent to landlord (৳)"
        inputMode="decimal"
        placeholder="260000"
        defaultValue={
          building?.landlordRentPaisa != null ? formatTaka(building.landlordRentPaisa, { symbol: false }) : ""
        }
        errors={e}
      />
      <Field name="notes" label="Notes" defaultValue={building?.notes ?? ""} errors={e} />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Saving…" : isEdit ? "Save details" : "Create building"}
        </Button>
      </div>
    </form>
  );
}
