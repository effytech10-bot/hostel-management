"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FUND_ORDERS, fundOrderLabel, parseFundOrder } from "@/server/domain/finance";
import type { ActionState } from "@/server/errors";
import { savePaymentOrderAction } from "./actions";

export function PaymentOrderForm({ order }: { order: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePaymentOrderAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-col gap-1">
        <Label htmlFor="order" className="text-ink-2 text-[12.5px] font-semibold">
          Order
        </Label>
        <Select id="order" name="order" defaultValue={order} className="h-9 text-[13.5px]">
          {FUND_ORDERS.map((o) => (
            <option key={o} value={o}>
              {fundOrderLabel(parseFundOrder(o))}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={pending} className="h-9">
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormMessage error={state.error} message={state.message} className="py-1" />
    </form>
  );
}
