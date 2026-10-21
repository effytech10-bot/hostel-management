import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { AccountSummary, PaymentHistory } from "@/components/payments/account-summary";
import { TokenHistory } from "@/components/tokens/student-token-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <CardTitle>Tokens</CardTitle>
          <CardDescription>Tap a token to see what was in it and what was paid on it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TokenHistory tokens={tokenList} tokensPath="/student/tokens" />
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
