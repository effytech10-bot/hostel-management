import { ChevronLeft, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HowToPay } from "@/components/student-portal/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { METHOD_LABEL } from "@/lib/validation/payments";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getPrintableTokens, getTokenView } from "@/server/services/tokens";
import { TokenCard } from "./token-card";
import { TokenStateBadge } from "./token-status";

export async function StudentTokenDetailPage({
  actor,
  code,
}: {
  actor: SessionUser;
  code: string;
}) {
  let view;
  try {
    view = await getTokenView(actor, decodeURIComponent(code));
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const { token, student } = view;
  const printable = await getPrintableTokens(actor, { tokenId: token.id });
  const accounts = printable.accounts;

  return (
    <div className="flex flex-col gap-3">
      {/* Back and Action Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 -ml-2 text-muted hover:text-ink gap-1">
          <Link href="/student/account">
            <ChevronLeft className="size-4" />
            <span>Account</span>
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Link href={`/print/tokens?token=${token.id}`} target="_blank">
            <Printer className="size-3.5" />
            <span>Print / PDF</span>
          </Link>
        </Button>
      </div>

      {/* Title & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold text-ink leading-tight">
            {token.kind === "admission" ? "Admission bill" : `Bill for ${formatPeriod(token.period)}`}
          </h1>
          <p className="text-muted text-[12px] font-mono mt-0.5">{token.code}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <TokenStateBadge state={view.state} />
          {token.early && <Badge variant="info">Early</Badge>}
        </div>
      </div>

      {!view.isLatest && view.latestCode && (
        <Note variant="warn" className="text-xs">
          This is an older token. Anything unpaid here was moved to your newest token{" "}
          <Link href={`/student/tokens/${view.latestCode}`} className="font-semibold underline">
            {view.latestCode}
          </Link>
          .
        </Note>
      )}

      {/* Responsive Paper Token: seamlessly fits phone width */}
      <div className="w-full overflow-hidden rounded-[10px] border border-line bg-surface p-2 shadow-card">
        <TokenCard token={printable.tokens[0]} orgName={actor.orgName} accounts={printable.accounts} />
      </div>

      {view.remainingPaisa > 0 && (
        <div className="rounded-[10px] border border-bad-line bg-bad-bg p-3.5 flex items-center justify-between text-[13.5px]">
          <span className="font-medium text-bad">Still unpaid from this bill:</span>
          <span className="font-bold tabular-nums text-bad text-[16px]">{formatTaka(view.remainingPaisa)}</span>
        </div>
      )}

      {/* Payment details list */}
      <Card>
        <CardHeader>
          <CardTitle>Payment details</CardTitle>
        </CardHeader>
        <CardContent>
          {view.payments.length === 0 ? (
            <p className="text-muted text-[13px]">No payment recorded on this token yet.</p>
          ) : (
            <ul className="divide-line-2 flex flex-col divide-y text-[13px]">
              {view.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/receipts/${p.id}`}
                      target="_blank"
                      className="text-brand font-mono font-bold hover:underline"
                    >
                      {p.receiptNo}
                    </Link>
                    <p className="text-muted text-[11.5px] mt-0.5 truncate">
                      {p.paidDate} · {p.accountName}
                      {p.trxId ? ` · ${p.trxId}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={
                        p.voidedAt
                          ? "tabular-nums line-through opacity-60 text-[13px]"
                          : "tabular-nums font-bold text-ink text-[14px]"
                      }
                    >
                      {formatTaka(p.amountPaisa)}
                    </span>
                    {p.voidedAt && <Badge variant="destructive" className="ml-1.5 text-[10px]">Void</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* How to pay note */}
      {view.remainingPaisa > 0 && accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>How to pay</CardTitle>
          </CardHeader>
          <CardContent>
            <HowToPay
              accounts={view.accounts.map((a) => ({
                id: a.id,
                name: a.name,
                method: a.method as keyof typeof METHOD_LABEL,
                details: a.details,
              }))}
              studentCode={student.code}
              tokenCode={token.code}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
