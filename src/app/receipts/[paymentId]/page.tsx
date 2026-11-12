import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyReceipt } from "@/components/payments/money-receipt";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { formatPeriod, periodOf } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/validation/payments";
import { homePathFor } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { receiptBoxes } from "@/server/domain/finance";
import { AppError } from "@/server/errors";
import { getReceipt } from "@/server/services/payments";
import { PrintButton, VoidPaymentForm } from "./receipt-actions";

export const metadata: Metadata = { title: "Money receipt" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const boxes = receiptBoxes(r.allocations);

  return (
    <main className="mx-auto max-w-xl p-4 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-muted-foreground text-[13px]">
          {METHOD_LABEL[payment.method]} · {r.accountName}
          {payment.trxId && <span className="font-mono"> · {payment.trxId}</span>}
          {payment.note && ` · ${payment.note}`}
        </p>
        <div className="flex gap-2">
          {r.tokenCode && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${homePathFor(user.role)}/tokens/${r.tokenCode}`}>Open token</Link>
            </Button>
          )}
          <PrintButton />
        </div>
      </div>

      {voided && (
        <Note variant="bad" className="mb-3 print:hidden">
          This payment was voided on {payment.voidedAt!.toISOString().slice(0, 10)}: {payment.voidReason}
        </Note>
      )}

      <MoneyReceipt
        r={{
          orgName: user.orgName,
          receiptNo: payment.receiptNo,
          date: payment.paidDate,
          name: student.fullName,
          buildingNo: r.buildingCode ?? "",
          roomNo: r.seat ? `${r.seat.roomNumber}-${r.seat.seatLabel}` : "",
          month: formatPeriod(r.tokenPeriod ?? periodOf(payment.paidDate)),
          ...boxes,
          preMealPaisa: r.preMealPaisa,
          tokenId: r.tokenCode ?? "",
          amountPaisa: payment.amountPaisa,
          duePaisa: Math.max(0, payment.balanceAfterPaisa),
          receivedBy: r.receivedByName ?? "",
          voided,
        }}
      />

      {user.role === "admin" && !voided && (
        <div className="mt-6 print:hidden">
          <VoidPaymentForm paymentId={payment.id} />
        </div>
      )}
    </main>
  );
}
