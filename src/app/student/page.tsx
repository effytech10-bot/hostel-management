import type { Metadata } from "next";
import Link from "next/link";
import { HowToPay, DueNow, StudentStrip, TokenView } from "@/components/student-portal/parts";
import { PaymentHistory } from "@/components/payments/account-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentPeriod, formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { formatMealUnits } from "@/server/domain/meals";
import { getStudentMoney } from "@/server/services/payments";
import { getMyMealMonth, getMyStudent, listPayToAccounts } from "@/server/services/student-portal";
import { getPrintableTokens, listStudentTokens } from "@/server/services/tokens";

export const metadata: Metadata = { title: "Home" };

export default async function StudentHome() {
  const user = await requireRole("student");
  const me = await getMyStudent(user);
  const period = currentPeriod();
  const [money, tokenList, accounts, meals] = await Promise.all([
    getStudentMoney(user, me.id),
    listStudentTokens(user, me.id),
    listPayToAccounts(user),
    getMyMealMonth(user, period),
  ]);
  const latest = tokenList[0] ?? null;
  const printed = latest ? await getPrintableTokens(user, { tokenId: latest.id }) : null;
  const printable = printed?.tokens[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <StudentStrip me={me} />
      <DueNow totalPaisa={money.totalPaisa} />

      <Card>
        <CardHeader>
          <CardTitle>Latest token</CardTitle>
        </CardHeader>
        <CardContent>
          {latest && printable ? (
            <TokenView
              token={printable}
              state={latest.state}
              remainingPaisa={latest.remainingPaisa}
              orgName={user.orgName}
              accounts={printed?.accounts ?? []}
            />
          ) : (
            <p className="text-muted text-[13px]">
              No token yet. Your token appears here at the start of each month.
            </p>
          )}
        </CardContent>
      </Card>

      {money.totalPaisa > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>How to pay</CardTitle>
          </CardHeader>
          <CardContent>
            <HowToPay accounts={accounts} studentCode={me.studentCode} tokenCode={latest?.code} />
          </CardContent>
        </Card>
      )}

      {me.status === "active" && (
        <Card>
          <CardHeader>
            <CardTitle>Meals in {formatPeriod(period)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-[13.5px]">
            <p>
              Eaten so far: <span className="font-semibold text-ink">{formatMealUnits(meals.soFar.halfUnits)} meals</span>{" "}
              <span className="text-muted text-[12.5px]">
                (breakfast {meals.soFar.breakfast}, lunch {meals.soFar.lunch}, dinner {meals.soFar.dinner})
              </span>
            </p>
            {meals.soFarCostPaisa !== null && (
              <p>
                Meal cost so far: <span className="font-semibold tabular-nums text-ink">{formatTaka(meals.soFarCostPaisa)}</span>
              </p>
            )}
            <Button asChild size="sm" variant="outline" className="mt-1 self-start">
              <Link href="/student/meals">
                {meals.rules.cutoffText ? "Turn meals on / off, see day by day" : "See day by day"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          <PaymentHistory payments={money.payments.slice(0, 5)} refunds={money.refunds.slice(0, 2)} />
          <Link href="/student/account" className="text-brand text-[13px] font-semibold hover:underline mt-1 self-start">
            Full account and all tokens →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
