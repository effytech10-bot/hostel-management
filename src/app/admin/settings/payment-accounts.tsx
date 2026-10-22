"use client";

import { useActionState, useEffect, useRef } from "react";
import { createPaymentAccountAction, togglePaymentAccountAction } from "@/app/_actions/payments";
import { ActionButton } from "@/components/forms/action-button";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { METHOD_LABEL, PAYMENT_METHODS } from "@/lib/validation/payments";
import type { ActionState } from "@/server/errors";

type Account = {
  id: string;
  name: string;
  method: keyof typeof METHOD_LABEL;
  details: string | null;
  isActive: boolean;
};

export function PaymentAccounts({ accounts }: { accounts: Account[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPaymentAccountAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col divide-y divide-line-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{METHOD_LABEL[a.method]}</Badge>
              <span className={a.isActive ? "font-semibold text-ink text-[13.5px]" : "text-muted font-medium line-through text-[13.5px]"}>
                {a.name}
              </span>
              {a.details && <span className="text-muted font-mono text-[12.5px] ml-1">{a.details}</span>}
            </span>
            <ActionButton action={togglePaymentAccountAction} fields={{ accountId: a.id }} variant="ghost">
              {a.isActive ? "Disable" : "Enable"}
            </ActionButton>
          </li>
        ))}
      </ul>

      <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-3 pt-4 border-t border-line-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="acc-method" className="text-[12.5px] font-semibold text-ink-2">
            Type
          </Label>
          <Select id="acc-method" name="method" defaultValue="bkash" className="h-9 text-[13.5px]">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </div>
        <Field name="name" label="Name" placeholder="bKash 01867-271100 (Nayan)" required errors={state.fieldErrors} />
        <Field name="details" label="Details" placeholder="A/C no, branch (optional)" errors={state.fieldErrors} />
        <div className="flex flex-col gap-3 sm:col-span-3">
          <FormMessage error={state.error} message={state.message} />
          <Button type="submit" variant="outline" size="sm" disabled={pending} className="w-fit">
            {pending ? "Adding…" : "Add account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
