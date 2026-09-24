"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/server/errors";
import { bulkRoomsAction, createRoomAction } from "../actions";

/** Add many rooms at once: "601 to 615, 2 seats each, ৳8,000". */
export function BulkRoomsForm({ buildingId }: { buildingId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(bulkRoomsAction, {});
  const e = state.fieldErrors;
  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="buildingId" value={buildingId} />
      <Field name="from" label="From room" placeholder="601" inputMode="numeric" required errors={e} />
      <Field name="to" label="To room" placeholder="615" inputMode="numeric" required errors={e} />
      <Field
        name="seats"
        label="Seats per room"
        placeholder="2"
        defaultValue="2"
        hint='A number, or labels "A,B,C"'
        required
        errors={e}
      />
      <Field
        name="defaultRent"
        label="Default rent (৳)"
        placeholder="8000"
        inputMode="decimal"
        hint="Optional"
        errors={e}
      />
      <div className="col-span-2 flex flex-col gap-3 md:col-span-4">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Adding…" : "Add rooms"}
        </Button>
      </div>
    </form>
  );
}

/** Add one room with any number ("G-2", "Roof"). */
export function SingleRoomForm({ buildingId }: { buildingId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createRoomAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const e = state.fieldErrors;
  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="buildingId" value={buildingId} />
      <Field name="number" label="Room number" placeholder="G-2" required errors={e} />
      <Field
        name="floor"
        label="Floor"
        placeholder="0"
        inputMode="numeric"
        hint="Blank = from room number"
        errors={e}
      />
      <Field name="seats" label="Seats" defaultValue="2" required errors={e} />
      <Field name="defaultRent" label="Default rent (৳)" inputMode="decimal" errors={e} />
      <div className="col-span-2 flex flex-col gap-3 md:col-span-4">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" variant="outline" disabled={pending} className="w-fit">
          {pending ? "Adding…" : "Add room"}
        </Button>
      </div>
    </form>
  );
}
