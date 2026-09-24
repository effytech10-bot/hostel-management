"use client";

import { useActionState, useState } from "react";
import { leaveAction, refundAction, type LeaveState } from "@/app/_actions/leave";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dhakaDate } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { ActionState } from "@/server/errors";

type Account = { id: string; name: string };

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t pt-2 font-semibold" : "flex justify-between gap-4"}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Admin: preview the final statement, then confirm the leave (optionally paying back the balance at once). */
export function LeaveForm({ studentId, accounts }: { studentId: string; accounts: Account[] }) {
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(leaveAction, {});
  const [lastDay, setLastDay] = useState(dhakaDate());
  const [refundAccountId, setRefundAccountId] = useState("");
  const s = state.statement;

  if (state.confirmed && s) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
        <p className="font-semibold">
          {s.fullName} has left (last day {s.lastDay}). The seat is free again.
        </p>
        <p className="mt-1">
          {s.finalBalancePaisa > 0
            ? `Still to collect from the student: ${formatTaka(s.finalBalancePaisa)} (take it from Payments).`
            : s.finalBalancePaisa < 0
              ? refundAccountId
                ? `Refund of ${formatTaka(-s.finalBalancePaisa)} recorded.`
                : `The hostel owes the student ${formatTaka(-s.finalBalancePaisa)}. Record the refund below when it is paid.`
              : "Nothing to pay on either side."}
        </p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => window.location.reload()}>
          Refresh page
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="lastDay"
          label="Last day in the hostel"
          type="date"
          value={lastDay}
          onChange={(e) => setLastDay(e.target.value)}
          max={dhakaDate()}
          errors={state.fieldErrors}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="refundAccountId">If the hostel owes money back, pay it now from</Label>
          <Select
            id="refundAccountId"
            name="refundAccountId"
            value={refundAccountId}
            onChange={(e) => setRefundAccountId(e.target.value)}
          >
            <option value="">Do not pay now</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {s && !state.confirmed && (
        <div className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-4 text-sm">
          <p className="mb-1 font-semibold">Final statement if the last day is {s.lastDay}</p>
          {s.meal && (
            <Line
              label={`Meals this month (${s.meal.breakfast} breakfast, ${s.meal.lunch} lunch, ${s.meal.dinner} dinner): ${formatTaka(s.meal.costPaisa)} vs deposit ${formatTaka(s.meal.depositPaisa)}`}
              value={
                s.meal.differencePaisa >= 0
                  ? `+${formatTaka(s.meal.differencePaisa)}`
                  : `−${formatTaka(-s.meal.differencePaisa)}`
              }
            />
          )}
          {(s.rentBackPaisa > 0 || s.baburchiBackPaisa > 0) && (
            <Line
              label={`${s.unusedDays} unused day(s) of rent and baburchi given back`}
              value={`−${formatTaka(s.rentBackPaisa + s.baburchiBackPaisa)}`}
            />
          )}
          {s.rule === "full" && s.unusedDays > 0 && (
            <Line label="Rule is “full month”: no rent given back for unused days" value="—" />
          )}
          <Line label="Advance the student paid (returned against dues)" value={`−${formatTaka(s.advanceHeldPaisa)}`} />
          <Line label="Balance before leaving" value={formatTaka(s.balanceBeforePaisa)} />
          <Line
            strong
            label={
              s.finalBalancePaisa > 0
                ? "Student still has to pay"
                : s.finalBalancePaisa < 0
                  ? "Hostel gives back"
                  : "Settled"
            }
            value={formatTaka(Math.abs(s.finalBalancePaisa))}
          />
        </div>
      )}

      <FormMessage error={state.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>
          {pending ? "Working…" : "Preview final statement"}
        </Button>
        {s && !state.confirmed && s.lastDay === lastDay && (
          <Button
            type="submit"
            name="intent"
            value="confirm"
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              if (!window.confirm(`Record that ${s.fullName} has left? This cannot be undone.`)) e.preventDefault();
            }}
          >
            Confirm leave
          </Button>
        )}
      </div>
    </form>
  );
}

export function RefundForm({
  studentId,
  maxPaisa,
  accounts,
}: {
  studentId: string;
  maxPaisa: number;
  accounts: Account[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(refundAction, {});
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="studentId" value={studentId} />
      <Field
        name="amount"
        label="Amount (৳)"
        inputMode="decimal"
        defaultValue={formatTaka(maxPaisa, { symbol: false })}
        required
        errors={state.fieldErrors}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="refund-account">Paid from</Label>
        <Select id="refund-account" name="accountId" defaultValue={accounts[0]?.id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>
      <Field name="note" label="Note" placeholder="Optional" errors={state.fieldErrors} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" variant="outline" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Record refund"}
        </Button>
      </div>
    </form>
  );
}
