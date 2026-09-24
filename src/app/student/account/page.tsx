import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { AccountSummary, PaymentHistory } from "@/components/payments/account-summary";
import { TokenStatusBadge } from "@/components/tokens/token-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { getStudentMoney } from "@/server/services/payments";
import { getMyStudent } from "@/server/services/student-portal";
import { listStudentTokens } from "@/server/services/tokens";

export const metadata: Metadata = { title: "My account" };

export default async function StudentAccountPage() {
  const user = await requireRole("student");
  const me = await getMyStudent(user);
  const [money, tokenList] = await Promise.all([getStudentMoney(user, me.id), listStudentTokens(user, me.id)]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title="My account" description="Everything you were charged and everything you paid." />

      <Card>
        <CardHeader>
          <CardTitle>Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountSummary
            balances={money.balances}
            dues={money.dues}
            totalPaisa={money.totalPaisa}
            advanceHeldPaisa={money.advanceHeldPaisa}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bills (tokens)</CardTitle>
          <CardDescription>Tap a bill to open it as a paper token.</CardDescription>
        </CardHeader>
        <CardContent>
          {tokenList.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bills yet.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {tokenList.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/print/tokens?token=${t.id}`} target="_blank" className="text-primary hover:underline">
                    {t.kind === "admission" ? "Admission" : formatPeriod(t.period)}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatTaka(t.totalPaisa)}</span>
                    <TokenStatusBadge status={t.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments and receipts</CardTitle>
          <CardDescription>Tap a receipt number to open the receipt.</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentHistory payments={money.payments} refunds={money.refunds} />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Something looks wrong? Tell the hostel office. Only the office can correct your account.
      </p>
    </div>
  );
}
