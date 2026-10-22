"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { recordPaymentAction, type PaymentState } from "@/app/_actions/payments";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { dhakaDate } from "@/lib/dates";
import { formatTaka, tryParseTaka } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/validation/payments";

type Account = { id: string; name: string; method: keyof typeof METHOD_LABEL };

/** Take a payment on the student's newest token. Any amount; extra money shows as "Extra paid" on the next token. */
export function TokenPaymentForm({
  studentId,
  tokenCode,
  remainingPaisa,
  accounts,
}: {
  studentId: string;
  tokenCode: string;
  remainingPaisa: number;
  accounts: Account[];
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<PaymentState, FormData>(recordPaymentAction, {});
  const [amount, setAmount] = useState(remainingPaisa > 0 ? formatTaka(remainingPaisa, { symbol: false }) : "");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.method === "cash")?.id ?? accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const e = state.fieldErrors;
  const amountPaisa = tryParseTaka(amount);
  const after = amountPaisa !== null && amountPaisa > 0 ? remainingPaisa - amountPaisa : null;

  if (state.recorded) {
    const r = state.recorded;
    return (
      <Note variant="ok" className="flex flex-col items-start gap-3 p-4">
        <p className="text-[15px] font-bold text-ok">
          Payment saved on {r.tokenCode ?? tokenCode} ✓ Receipt {r.receiptNo}
        </p>
        {r.duplicate && <p className="text-muted-foreground text-xs">This form was already submitted; no second payment was made.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm">
            <Link href={`/receipts/${r.paymentId}`} target="_blank">
              Open / print token with this payment
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Done
          </Button>
        </div>
      </Note>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field
          name="amount"
          label="Amount received (৳)"
          inputMode="decimal"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          className="h-10 text-lg font-bold tabular-nums"
          required
          errors={e}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountId" className="text-[12.5px] font-semibold text-ink-2">
            Received in
          </Label>
          <Select
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(ev) => setAccountId(ev.target.value)}
            className="h-10 text-[14px]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {METHOD_LABEL[a.method]} · {a.name}
              </option>
            ))}
          </Select>
          <FieldError errors={e?.accountId} />
        </div>
        {account && account.method !== "cash" && (
          <Field
            name="trxId"
            label="Transaction ID *"
            placeholder="e.g. 9JK7H2LM4P"
            autoCapitalize="characters"
            className="font-mono text-[13.5px]"
            required
            errors={e}
          />
        )}
        <Field name="paidDate" label="Date" type="date" defaultValue={dhakaDate()} errors={e} />
        <Field name="note" label="Note" placeholder="Optional" errors={e} wrapperClassName="sm:col-span-2" />
      </div>

      {after !== null && (
        <Note variant={after > 0 ? "warn" : "ok"} className="font-medium text-[13px]">
          {after > 0
            ? `Still due on this token after this: ${formatTaka(after)}`
            : after < 0
              ? `Fully paid. ${formatTaka(-after)} extra will show as "Extra paid" on the next token.`
              : "Fully paid after this."}
        </Note>
      )}

      <FormMessage error={state.error} />
      <Button type="submit" size="default" disabled={pending || accounts.length === 0} className="w-fit">
        {pending ? "Saving…" : "Save payment & make receipt"}
      </Button>
    </form>
  );
}
