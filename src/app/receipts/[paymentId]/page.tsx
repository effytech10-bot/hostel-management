import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Note } from "@/components/ui/note";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/validation/payments";
import { requireUser } from "@/server/auth/session";
import { HEAD_LABEL } from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { getReceipt } from "@/server/services/payments";
import { getPrintableTokens } from "@/server/services/tokens";
import { TokenCard } from "@/components/tokens/token-card";
import { PrintButton, VoidPaymentForm } from "./receipt-actions";

export const metadata: Metadata = { title: "Receipt" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[13.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = await requireUser();
  const { paymentId } = await params;
  if (!UUID_RE.test(paymentId)) notFound();

  let r;
  try {
    r = await getReceipt(user, paymentId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { payment, student } = r;
  const voided = !!payment.voidedAt;

  // A payment belongs to a token: show the token with this payment in it.
  if (payment.tokenId) {
    const { tokens: list, accounts } = await getPrintableTokens(user, { tokenId: payment.tokenId });
    const token = list[0];
    if (token) {
      return (
        <main className="mx-auto max-w-2xl p-4 print:max-w-none print:p-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-[13.5px]">
              Receipt <b className="font-mono">{payment.receiptNo}</b> · {formatTaka(payment.amountPaisa)} on{" "}
              {payment.paidDate} ({METHOD_LABEL[payment.method]} · {r.accountName}) · received by{" "}
              {r.receivedByName ?? "—"}
            </p>
            <PrintButton />
          </div>
          {voided && (
            <Note variant="bad" className="mb-3">
              This payment was voided on {payment.voidedAt!.toISOString().slice(0, 10)}: {payment.voidReason}
            </Note>
          )}
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <TokenCard token={token} orgName={user.orgName} accounts={accounts} highlightPaymentId={payment.id} />
            </div>
          </div>
          {user.role === "admin" && !voided && (
            <div className="mt-6 print:hidden">
              <VoidPaymentForm paymentId={payment.id} />
            </div>
          )}
        </main>
      );
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 print:max-w-none print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <PrintButton />
      </div>

      <article className="receipt bg-surface text-ink border-line relative rounded-[12px] border border-dashed p-6 shadow-card print:border-0 print:p-0 print:shadow-none">
        {voided && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="border-bad text-bad/70 -rotate-12 rounded-md border-4 px-6 py-2 text-5xl font-bold">
              VOID
            </span>
          </div>
        )}

        <header className="border-line-2 mb-4 border-b pb-3 text-center">
          <p className="text-ink text-lg font-bold">{user.orgName}</p>
          <p className="text-muted-foreground text-xs font-medium">Money receipt</p>
        </header>

        <div className="mb-3 flex justify-between text-sm">
          <span>
            Receipt <span className="font-mono font-bold">{payment.receiptNo}</span>
          </span>
          <span className="text-muted-foreground font-medium">{payment.paidDate}</span>
        </div>

        <section className="border-line-2 mb-3 border-b pb-3">
          <Row label="Student" value={student.fullName} />
          <Row label="Student ID" value={<span className="font-mono">{student.studentCode}</span>} />
          {r.tokenCode && <Row label="Token ID" value={<span className="font-mono">{r.tokenCode}</span>} />}
          <Row
            label="Building / seat"
            value={`${r.buildingCode ?? "—"}${r.seat ? ` · ${r.seat.roomNumber}-${r.seat.seatLabel}` : ""}`}
          />
          {(student.school || student.college) && (
            <Row label="School / college" value={[student.school, student.college].filter(Boolean).join(" / ")} />
          )}
        </section>

        <section className="border-line-2 mb-3 border-b pb-3">
          <p className="text-ink-2 mb-1.5 text-xs font-semibold">Paid for</p>
          {r.allocations.map((a) => (
            <Row
              key={`${a.period}-${a.head}`}
              label={
                a.head === "credit" ? "Advance for next bill" : `${HEAD_LABEL[a.head]} · ${formatPeriod(a.period)}`
              }
              value={formatTaka(a.amountPaisa)}
            />
          ))}
          <div className="border-line-2 mt-2 flex justify-between border-t pt-2 text-[15px] font-bold">
            <span>Total paid</span>
            <span className="tabular-nums">{formatTaka(payment.amountPaisa)}</span>
          </div>
        </section>

        <section className="border-line-2 mb-3 border-b pb-3">
          <Row label="Due before" value={formatTaka(payment.balanceBeforePaisa)} />
          <Row
            label={payment.balanceAfterPaisa < 0 ? "Credit after" : "Remaining due"}
            value={formatTaka(Math.abs(payment.balanceAfterPaisa))}
          />
        </section>

        <section className="mb-4">
          <Row label="Method" value={`${METHOD_LABEL[payment.method]} · ${r.accountName}`} />
          {payment.trxId && <Row label="Transaction ID" value={<span className="font-mono">{payment.trxId}</span>} />}
          <Row label="Received by" value={r.receivedByName ?? "—"} />
          {payment.note && <Row label="Note" value={payment.note} />}
        </section>

        {voided && (
          <Note variant="bad" className="mb-3">
            Voided on {payment.voidedAt!.toISOString().slice(0, 10)}: {payment.voidReason}
          </Note>
        )}
        <p className="text-muted-foreground font-bangla mt-4 text-center text-xs">
          ভুল হলে এই রসিদ মোছা যায় না — অ্যাডমিন কারণ লিখে &quot;Void&quot; করেন, আর টাকা আবার বাকিতে ফিরে আসে।
        </p>
      </article>

      {user.role === "admin" && !voided && (
        <div className="mt-6 print:hidden">
          <VoidPaymentForm paymentId={payment.id} />
        </div>
      )}
    </main>
  );
}
