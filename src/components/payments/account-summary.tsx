import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
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
        className={cn(
          "rounded-[12px] border p-4 shadow-card",
          totalPaisa > 0
            ? "border-bad-line bg-bad-bg text-bad"
            : totalPaisa < 0
              ? "border-ok-line bg-ok-bg text-ok"
              : "border-line bg-surface-2 text-ink-2",
        )}
      >
        <p className="text-[12.5px] font-medium leading-tight opacity-90">
          {totalPaisa > 0 ? "Total due" : totalPaisa < 0 ? "Has credit" : "Balance"}
        </p>
        <p className="mt-0.5 text-3xl font-bold tabular-nums">{formatTaka(Math.abs(totalPaisa))}</p>
      </div>

      {advanceHeldPaisa > 0 && (
        <p className="text-muted-foreground text-[13px] leading-normal">
          Advance paid and held by the hostel:{" "}
          <span className="text-ink font-semibold tabular-nums">{formatTaka(advanceHeldPaisa)}</span> (returned
          against dues when the student leaves)
        </p>
      )}

      {heads.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {heads.map(([head, amount]) => (
            <div
              key={head}
              className="border-line-2 bg-surface flex items-center justify-between rounded-[9px] border px-3 py-2 text-[13.5px]"
            >
              <span className="text-muted-foreground font-medium">{HEAD_LABEL[head]}</span>
              <span className={cn("tabular-nums font-semibold", amount > 0 ? "text-bad" : "text-ok")}>
                {amount > 0 ? formatTaka(amount) : `${formatTaka(-amount)} credit`}
              </span>
            </div>
          ))}
        </div>
      )}

      {dues.length > 0 && (
        <details className="border-line-2 bg-surface rounded-[9px] border p-3">
          <summary className="text-brand cursor-pointer text-[13px] font-semibold select-none hover:underline">
            Dues by month ({dues.length})
          </summary>
          <ul className="divide-line-2 mt-2 flex flex-col divide-y text-[13px]">
            {dues.map((d) => (
              <li key={`${d.period}-${d.head}`} className="flex justify-between gap-4 py-1.5">
                <span className="text-muted-foreground">
                  {formatPeriod(d.period)} · {HEAD_LABEL[d.head]}
                </span>
                <span className="text-ink font-semibold tabular-nums">{formatTaka(d.amountPaisa)}</span>
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
    <ul className="divide-line-2 flex flex-col divide-y text-[13.5px]">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>
            <Link href={`/receipts/${p.id}`} target="_blank" className="text-brand font-bold hover:underline font-mono">
              {p.receiptNo}
            </Link>{" "}
            <span className="text-muted-foreground text-[12.5px]">
              · {p.paidDate} · {p.accountName}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {p.voidedAt && <Badge variant="destructive">Void</Badge>}
            <span className={p.voidedAt ? "tabular-nums line-through opacity-60" : "tabular-nums font-semibold"}>
              {formatTaka(p.amountPaisa)}
            </span>
          </span>
        </li>
      ))}
      {refunds.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>
            <span className="font-semibold text-ink">Refund</span>{" "}
            <span className="text-muted-foreground text-[12.5px]">
              · {r.paidDate} · {r.accountName}
              {r.note ? ` · ${r.note}` : ""}
            </span>
          </span>
          <span className="text-ok font-semibold tabular-nums">−{formatTaka(r.amountPaisa)}</span>
        </li>
      ))}
    </ul>
  );
}
