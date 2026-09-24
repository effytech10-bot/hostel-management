import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/validation/payments";
import { requireUser } from "@/server/auth/session";
import { HEAD_LABEL } from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { getReceipt } from "@/server/services/payments";
import { PrintButton, VoidPaymentForm } from "./receipt-actions";

export const metadata: Metadata = { title: "Receipt" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
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

  return (
    <main className="mx-auto max-w-md p-4 print:max-w-none print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <PrintButton />
      </div>

      <article className="relative rounded-xl border bg-white p-6 text-sm text-black shadow-sm print:rounded-none print:border-0 print:shadow-none">
        {voided && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 rounded-md border-4 border-red-600 px-6 py-2 text-5xl font-bold text-red-600/70">
              VOID
            </span>
          </div>
        )}

        <header className="mb-4 border-b pb-3 text-center">
          <p className="text-lg font-bold">{user.orgName}</p>
          <p className="text-muted-foreground text-xs">Money receipt</p>
        </header>

        <div className="mb-3 flex justify-between text-sm">
          <span>
            Receipt <span className="font-semibold">{payment.receiptNo}</span>
          </span>
          <span>{payment.paidDate}</span>
        </div>

        <section className="mb-3 border-b pb-3">
          <Row label="Student" value={student.fullName} />
          <Row label="Student ID" value={student.studentCode} />
          <Row
            label="Building / seat"
            value={`${r.buildingCode ?? "—"}${r.seat ? ` · ${r.seat.roomNumber}-${r.seat.seatLabel}` : ""}`}
          />
          {(student.school || student.college) && (
            <Row label="School / college" value={[student.school, student.college].filter(Boolean).join(" / ")} />
          )}
        </section>

        <section className="mb-3 border-b pb-3">
          <p className="mb-1 font-semibold">Paid for</p>
          {r.allocations.map((a) => (
            <Row
              key={`${a.period}-${a.head}`}
              label={
                a.head === "credit" ? "Advance for next bill" : `${HEAD_LABEL[a.head]} · ${formatPeriod(a.period)}`
              }
              value={formatTaka(a.amountPaisa)}
            />
          ))}
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold">
            <span>Total paid</span>
            <span>{formatTaka(payment.amountPaisa)}</span>
          </div>
        </section>

        <section className="mb-3 border-b pb-3">
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
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">
            Voided on {payment.voidedAt!.toISOString().slice(0, 10)}: {payment.voidReason}
          </p>
        )}
        <p className="text-muted-foreground mt-4 text-center text-xs">
          Computer generated receipt. No signature needed.
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
