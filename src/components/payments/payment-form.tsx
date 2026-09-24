"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { recordPaymentAction, type PaymentState } from "@/app/_actions/payments";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dhakaDate, formatPeriod } from "@/lib/dates";
import { formatTaka, tryParseTaka } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/validation/payments";
import { allocatePayment, HEAD_LABEL, type Due } from "@/server/domain/billing";

type Account = { id: string; name: string; method: keyof typeof METHOD_LABEL };

export function PaymentForm({
  studentId,
  dues,
  totalPaisa,
  accounts,
  studentsPath,
}: {
  studentId: string;
  dues: Due[];
  totalPaisa: number;
  accounts: Account[];
  studentsPath: string;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<PaymentState, FormData>(recordPaymentAction, {});
  const [amount, setAmount] = useState(totalPaisa > 0 ? formatTaka(totalPaisa, { symbol: false }) : "");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.method === "cash")?.id ?? accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const e = state.fieldErrors;

  const amountPaisa = tryParseTaka(amount);
  const preview = useMemo(() => {
    if (amountPaisa === null || amountPaisa <= 0) return null;
    return allocatePayment(dues, amountPaisa);
  }, [dues, amountPaisa]);

  if (state.recorded) {
    const r = state.recorded;
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
        <p className="text-lg font-semibold text-emerald-900">Payment saved ✓ Receipt {r.receiptNo}</p>
        {r.duplicate && <p className="text-sm">This form was already submitted; no second payment was made.</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/receipts/${r.paymentId}`} target="_blank">
              Open / print receipt
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${studentsPath}/${studentId}`}>Back to student</Link>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Take another payment
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="studentId" value={studentId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="amount"
          label="Amount received (৳)"
          inputMode="decimal"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          className="h-12 text-xl font-semibold"
          required
          errors={e}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="accountId">Received in</Label>
          <Select
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(ev) => setAccountId(ev.target.value)}
            className="h-12"
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
            required
            errors={e}
          />
        )}
        <Field name="paidDate" label="Date" type="date" defaultValue={dhakaDate()} errors={e} />
        <Field name="note" label="Note" placeholder="Optional" errors={e} wrapperClassName="sm:col-span-2" />
      </div>

      {preview && (
        <div className="bg-muted/40 rounded-lg border p-3 text-sm">
          <p className="mb-2 font-medium">This payment will clear:</p>
          {preview.allocations.length === 0 && <p className="text-muted-foreground">Nothing is due.</p>}
          <ul className="flex flex-col gap-1">
            {preview.allocations.map((a) => (
              <li key={`${a.period}-${a.head}`} className="flex justify-between gap-4">
                <span>
                  {HEAD_LABEL[a.head]} · {formatPeriod(a.period)}
                </span>
                <span className="tabular-nums">{formatTaka(a.amountPaisa)}</span>
              </li>
            ))}
            {preview.leftoverPaisa > 0 && (
              <li className="flex justify-between gap-4 text-emerald-700">
                <span>Extra, kept as credit for the next bill</span>
                <span className="tabular-nums">{formatTaka(preview.leftoverPaisa)}</span>
              </li>
            )}
          </ul>
          {amountPaisa !== null && (
            <p className="mt-2 border-t pt-2 font-medium">
              {totalPaisa - amountPaisa > 0
                ? `Still due after this: ${formatTaka(totalPaisa - amountPaisa)}`
                : totalPaisa - amountPaisa < 0
                  ? `Credit after this: ${formatTaka(amountPaisa - totalPaisa)}`
                  : "Fully paid after this"}
            </p>
          )}
        </div>
      )}

      <FormMessage error={state.error} />
      <Button type="submit" size="lg" disabled={pending || accounts.length === 0} className="w-fit">
        {pending ? "Saving…" : "Save payment & make receipt"}
      </Button>
    </form>
  );
}
