"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createFinanceEntryAction, type EntryState } from "@/app/_actions/finance";
import { voidFinanceEntryAction } from "@/app/_actions/finance";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dhakaDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { METHOD_LABEL } from "@/lib/validation/payments";
import { FUND_LABEL, FUNDS, type Fund } from "@/server/domain/finance";
import type { ActionState } from "@/server/errors";

type Kind = "expense" | "owner_withdraw" | "owner_deposit";
const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "expense", label: "Expense", hint: "Money spent: bazar, salary, house rent, bills…" },
  {
    key: "owner_withdraw",
    label: "Owner took money",
    hint: "Not an expense. Profit stays the same; the balance goes down.",
  },
  {
    key: "owner_deposit",
    label: "Owner put money in",
    hint: "Not income. Profit stays the same; the balance goes up.",
  },
];

/** Shown in the category list until the hostel has its own. Picking one creates it. */
const SUGGESTED_CATEGORIES = [
  "Bazar",
  "Baburchi salary",
  "Gas",
  "House rent",
  "Electricity bill",
  "Water bill",
  "Internet",
  "Staff salary",
  "Repair & maintenance",
  "Cleaning",
];

const labelClass = "text-[12.5px] font-semibold text-ink-2";

export function EntryForm({
  categories,
  accounts,
  buildings,
}: {
  categories: string[];
  accounts: { id: string; name: string; method: keyof typeof METHOD_LABEL }[];
  buildings: { id: string; code: string }[];
}) {
  const [state, formAction, pending] = useActionState<EntryState, FormData>(createFinanceEntryAction, {});
  const [firstRequestId] = useState(() => crypto.randomUUID());
  const requestIdRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("expense");
  const [fund, setFund] = useState<Fund>("meal");
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.fieldErrors;

  // After a save: empty the boxes and get a fresh id, so the next entry is a new one.
  useEffect(() => {
    if (!state.saved) return;
    formRef.current?.reset();
    if (requestIdRef.current) requestIdRef.current.value = crypto.randomUUID();
  }, [state.saved]);

  const options = [...new Set([...categories, ...SUGGESTED_CATEGORIES])];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3.5">
      <input ref={requestIdRef} type="hidden" name="requestId" defaultValue={firstRequestId} />
      <input type="hidden" name="kind" value={kind} />

      <div role="radiogroup" aria-label="What kind of entry" className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => setKind(k.key)}
            className={cn(
              "cursor-pointer rounded-[8px] border px-[11px] py-[6px] text-[13px] font-semibold transition-colors",
              kind === k.key
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground -mt-1.5 text-[12px]">{KINDS.find((k) => k.key === kind)!.hint}</p>

      {kind === "expense" && (
        <>
          <Field name="title" label="Title" placeholder="e.g. Friday bazar" required errors={e} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="f-category" className={labelClass}>
              Category
            </Label>
            <input
              id="f-category"
              name="category"
              list="expense-categories"
              placeholder="Choose, or type a new one"
              autoComplete="off"
              required
              aria-invalid={!!e?.category?.length}
              className="border-line bg-surface text-ink focus-visible:border-brand focus-visible:ring-brand/45 aria-invalid:border-bad h-[36px] w-full rounded-[9px] border px-2.5 text-[14px] shadow-xs outline-none focus-visible:ring-[3px]"
            />
            <datalist id="expense-categories">
              {options.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-muted-foreground text-[11.5px]">A new name is saved as a new category.</p>
            <FieldError errors={e?.category} />
          </div>
        </>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field
          name="amount"
          label="Amount (৳)"
          inputMode="decimal"
          placeholder="0"
          className="font-bold tabular-nums"
          required
          errors={e}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-fund" className={labelClass}>
            Which account
          </Label>
          <Select id="f-fund" name="fund" value={fund} onChange={(ev) => setFund(ev.target.value as Fund)}>
            {FUNDS.map((f) => (
              <option key={f} value={f}>
                {FUND_LABEL[f]}
              </option>
            ))}
          </Select>
          <FieldError errors={e?.fund} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-accountId" className={labelClass}>
            {kind === "owner_deposit" ? "Put into" : "Paid from"}
          </Label>
          <Select id="f-accountId" name="accountId" defaultValue={accounts.find((a) => a.method === "cash")?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {METHOD_LABEL[a.method]} · {a.name}
              </option>
            ))}
          </Select>
          <FieldError errors={e?.accountId} />
        </div>
        <Field name="entryDate" label="Date" type="date" defaultValue={dhakaDate()} max={dhakaDate()} errors={e} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="f-buildingId" className={labelClass}>
            Building (optional)
          </Label>
          <Select id="f-buildingId" name="buildingId" defaultValue="">
            <option value="">All / not one building</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </Select>
        </div>
        <Field name="note" label="Note" placeholder="Optional" errors={e} />
      </div>

      <FormMessage error={state.error} message={state.message} />
      <Button type="submit" disabled={pending || accounts.length === 0} className="w-fit">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** Cancel a wrong entry: asks for the reason. The entry stays in the list, marked "Cancelled". */
export function VoidEntry({ entryId }: { entryId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(voidFinanceEntryAction, {});
  return (
    <details className="text-left">
      <summary className="text-bad cursor-pointer text-[12.5px] font-semibold select-none hover:underline">
        Cancel
      </summary>
      <form action={formAction} className="mt-1.5 flex w-52 flex-col gap-1.5 whitespace-normal">
        <input type="hidden" name="entryId" value={entryId} />
        <input
          name="reason"
          required
          minLength={3}
          placeholder="Why? e.g. typed twice"
          aria-label="Reason for cancelling"
          className="border-line bg-surface focus-visible:border-brand h-8 rounded-[8px] border px-2 text-[12.5px] outline-none"
        />
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel this entry"}
        </Button>
        {state.error && <span className="text-bad text-xs font-semibold">{state.error}</span>}
      </form>
    </details>
  );
}
