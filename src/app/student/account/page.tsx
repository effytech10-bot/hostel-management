import type { Metadata } from "next";
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
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[18px] font-bold text-ink">My account</h1>
        <p className="text-muted text-[12.5px] mt-0.5">Everything you were charged and everything you paid.</p>
      </div>

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

      <p className="text-muted text-[12px] px-1">
        Something looks wrong? Tell the hostel office. Only the office can correct your account.
      </p>
    </div>
  );
}
