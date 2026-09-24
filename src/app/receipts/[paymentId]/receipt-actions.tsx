"use client";

import { useActionState } from "react";
import { voidPaymentAction } from "@/app/_actions/payments";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/server/errors";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} size="sm">
      Print receipt
    </Button>
  );
}

export function VoidPaymentForm({ paymentId }: { paymentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(voidPaymentAction, {});
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm text-red-700 select-none">Void this payment (admin)</summary>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm("Void this payment? The amount goes back onto the student's dues.")) e.preventDefault();
        }}
        className="mt-3 flex flex-col gap-3"
      >
        <input type="hidden" name="paymentId" value={paymentId} />
        <Field
          name="reason"
          label="Reason"
          placeholder="e.g. wrong student, wrong amount"
          required
          errors={state.fieldErrors}
        />
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" variant="destructive" size="sm" disabled={pending} className="w-fit">
          {pending ? "Voiding…" : "Void payment"}
        </Button>
      </form>
    </details>
  );
}
