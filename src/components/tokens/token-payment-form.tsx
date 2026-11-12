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
import {
  FUND_COLOR,
  FUND_SHORT,
  fundOrderLabel,
  splitPayment,
  sumFunds,
  zeroFunds,
  type Fund,
  type FundAmounts,
} from "@/server/domain/finance";

type Account = { id: string; name: string; method: keyof typeof METHOD_LABEL };

const plain = (paisa: number) => (paisa > 0 ? formatTaka(paisa, { symbol: false }).replace(/,/g, "") : "");
const PART_NAME: Record<Fund, string> = { rent: "rentAmount", meal: "mealAmount", service: "serviceAmount" };

/**
 * Take a payment on the student's newest token. Typing the total shares it between the three accounts in the
 * hostel's order; typing in an account's box changes only that part (the total follows).
 */
export function TokenPaymentForm({
  studentId,
  tokenCode,
  remainingPaisa,
  fundDues,
  order,
  accounts,
}: {
  studentId: string;
  tokenCode: string;
  remainingPaisa: number;
  fundDues: FundAmounts;
  order: Fund[];
  accounts: Account[];
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState<PaymentState, FormData>(recordPaymentAction, {});
  const split = (total: number) => splitPayment(total, fundDues, order);
  const toText = (a: FundAmounts) => ({ rent: plain(a.rent), meal: plain(a.meal), service: plain(a.service) });

  const [total, setTotal] = useState(plain(remainingPaisa));
  const [parts, setParts] = useState(() => toText(remainingPaisa > 0 ? split(remainingPaisa) : zeroFunds()));
  const [accountId, setAccountId] = useState(accounts.find((a) => a.method === "cash")?.id ?? accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const e = state.fieldErrors;

  const paisa = (f: Fund) => (parts[f].trim() === "" ? 0 : tryParseTaka(parts[f]));
  const values = { rent: paisa("rent"), meal: paisa("meal"), service: paisa("service") };
  const valid = Object.values(values).every((v) => v !== null && v >= 0);
  const typed = valid ? sumFunds(values as FundAmounts) : null;
  const after = typed !== null && typed > 0 ? remainingPaisa - typed : null;

  function onTotal(text: string) {
    setTotal(text);
    const p = text.trim() === "" ? 0 : tryParseTaka(text);
    if (p !== null && p >= 0) setParts(toText(split(p)));
  }

  function onPart(f: Fund, text: string) {
    const next = { ...parts, [f]: text };
    setParts(next);
    const all = order.map((k) => (next[k].trim() === "" ? 0 : tryParseTaka(next[k])));
    if (all.every((v) => v !== null && v >= 0)) setTotal(plain(all.reduce<number>((s, v) => s + (v ?? 0), 0)));
  }

  if (state.recorded) {
    const r = state.recorded;
    return (
      <Note variant="ok" className="flex flex-col items-start gap-3 p-4">
        <p className="text-ok text-[15px] font-bold">
          Payment saved on {r.tokenCode ?? tokenCode} ✓ Receipt {r.receiptNo}
        </p>
        {r.duplicate && (
          <p className="text-muted-foreground text-xs">This form was already submitted; no second payment was made.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm">
            <Link href={`/receipts/${r.paymentId}`} target="_blank">
              Open / print money receipt
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

      <Field
        name="amount"
        label="Total received (৳)"
        inputMode="decimal"
        value={total}
        onChange={(ev) => onTotal(ev.target.value)}
        className="h-11 text-xl font-bold tabular-nums"
        hint={`Fills ${fundOrderLabel(order)}. Extra money goes to Rent.`}
        required
        errors={e}
      />

      <fieldset className="border-line bg-surface-2 grid gap-3 rounded-[10px] border p-3 sm:grid-cols-3">
        <legend className="text-ink-2 px-1 text-[12px] font-semibold">Goes to which account</legend>
        {order.map((f) => (
          <div key={f} className="flex flex-col gap-1.5">
            <Label htmlFor={`part-${f}`} className="text-ink-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
              <span aria-hidden className="size-2 rounded-full" style={{ background: FUND_COLOR[f] }} />
              {FUND_SHORT[f]} acc
            </Label>
            <input
              id={`part-${f}`}
              name={PART_NAME[f]}
              inputMode="decimal"
              value={parts[f]}
              placeholder="0"
              onChange={(ev) => onPart(f, ev.target.value)}
              aria-invalid={values[f] === null}
              className="border-line bg-surface text-ink focus-visible:border-brand focus-visible:ring-brand/45 aria-invalid:border-bad h-9 w-full rounded-[9px] border px-2.5 text-[15px] font-semibold tabular-nums shadow-xs outline-none focus-visible:ring-[3px]"
            />
            <p className="text-muted-foreground text-[11.5px] tabular-nums">Due {formatTaka(fundDues[f])}</p>
            <FieldError errors={e?.[PART_NAME[f]]} />
          </div>
        ))}
      </fieldset>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountId" className="text-ink-2 text-[12.5px] font-semibold">
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
        <Field name="paidDate" label="Date" type="date" defaultValue={dhakaDate()} errors={e} />
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
        <Field name="note" label="Note" placeholder="Optional" errors={e} wrapperClassName="sm:col-span-2" />
      </div>

      {!valid && <Note variant="bad">Enter amounts in taka, e.g. 500 or 27.50.</Note>}
      {after !== null && (
        <Note variant={after > 0 ? "warn" : "ok"} className="text-[13px] font-medium">
          {after > 0
            ? `Still due on this token after this: ${formatTaka(after)}`
            : after < 0
              ? `Fully paid. ${formatTaka(-after)} extra will be taken off the next token.`
              : "Fully paid after this."}
        </Note>
      )}

      <FormMessage error={state.error} />
      <Button type="submit" size="default" disabled={pending || accounts.length === 0 || !valid} className="w-fit">
        {pending ? "Saving…" : "Save payment & make receipt"}
      </Button>
    </form>
  );
}
