"use client";

import { useActionState } from "react";
import { voidPaymentAction } from "@/app/_actions/payments";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/server/errors";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} size="sm" variant="outline">
      Print
    </Button>
  );
}

export function VoidPaymentForm({ paymentId }: { paymentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(voidPaymentAction, {});
  return (
    <details className="border-bad-line bg-bad-bg/20 rounded-[10px] border p-3.5">
      <summary className="text-bad cursor-pointer text-sm font-semibold select-none hover:underline">
        Void this payment (admin)
      </summary>
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
