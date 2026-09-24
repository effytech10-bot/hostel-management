import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { HEAD_LABEL, type Due, type LedgerHead } from "@/server/domain/billing";

/** Balance per head + open dues. Shared by the payment desk, student page and (later) the student's phone. */
export function AccountSummary({
  balances,
  dues,
  totalPaisa,
  advanceHeldPaisa = 0,
}: {
  balances: Partial<Record<LedgerHead, number>>;
  dues: Due[];
  totalPaisa: number;
  advanceHeldPaisa?: number;
}) {
  const heads = Object.entries(balances) as [LedgerHead, number][];
  return (
    <div className="flex flex-col gap-4">
      <div
        className={
          totalPaisa > 0
            ? "rounded-lg bg-red-50 p-4 text-red-900"
            : totalPaisa < 0
              ? "rounded-lg bg-emerald-50 p-4 text-emerald-900"
              : "bg-muted rounded-lg p-4"
        }
      >
        <p className="text-xs">{totalPaisa > 0 ? "Total due" : totalPaisa < 0 ? "Has credit" : "Balance"}</p>
        <p className="text-3xl font-semibold tabular-nums">{formatTaka(Math.abs(totalPaisa))}</p>
      </div>

      {advanceHeldPaisa > 0 && (
        <p className="text-muted-foreground text-sm">
          Advance paid and held by the hostel:{" "}
          <span className="text-foreground font-medium tabular-nums">{formatTaka(advanceHeldPaisa)}</span> (returned
          against dues when the student leaves)
        </p>
      )}

      {heads.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {heads.map(([head, amount]) => (
            <div key={head} className="flex justify-between rounded-md border px-3 py-2 text-sm">
              <span>{HEAD_LABEL[head]}</span>
              <span className={amount > 0 ? "text-red-700 tabular-nums" : "text-emerald-700 tabular-nums"}>
                {amount > 0 ? formatTaka(amount) : `${formatTaka(-amount)} credit`}
              </span>
            </div>
          ))}
        </div>
      )}

      {dues.length > 0 && (
        <details>
          <summary className="text-primary cursor-pointer text-sm select-none">Dues by month ({dues.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {dues.map((d) => (
              <li key={`${d.period}-${d.head}`} className="flex justify-between gap-4">
                <span>
                  {formatPeriod(d.period)} · {HEAD_LABEL[d.head]}
                </span>
                <span className="tabular-nums">{formatTaka(d.amountPaisa)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PaymentHistory({
  payments,
  refunds = [],
}: {
  refunds?: { id: string; amountPaisa: number; paidDate: string; accountName: string; note: string | null }[];
  payments: {
    id: string;
    receiptNo: string;
    amountPaisa: number;
    paidDate: string;
    accountName: string;
    voidedAt: Date | null;
  }[];
}) {
  if (payments.length === 0 && refunds.length === 0) {
    return <p className="text-muted-foreground text-sm">No payments yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y text-sm">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            <Link href={`/receipts/${p.id}`} target="_blank" className="text-primary font-medium hover:underline">
              {p.receiptNo}
            </Link>{" "}
            <span className="text-muted-foreground">
              · {p.paidDate} · {p.accountName}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {p.voidedAt && <Badge variant="destructive">Void</Badge>}
            <span className={p.voidedAt ? "tabular-nums line-through" : "tabular-nums"}>
              {formatTaka(p.amountPaisa)}
            </span>
          </span>
        </li>
      ))}
      {refunds.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            <span className="font-medium">Refund</span>{" "}
            <span className="text-muted-foreground">
              · {r.paidDate} · {r.accountName}
              {r.note ? ` · ${r.note}` : ""}
            </span>
          </span>
          <span className="text-emerald-700 tabular-nums">−{formatTaka(r.amountPaisa)}</span>
        </li>
      ))}
    </ul>
  );
}
