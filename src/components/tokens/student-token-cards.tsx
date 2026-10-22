import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dhakaDate, formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { planEarlyToken } from "@/server/services/token-engine";
import type { listStudentTokens } from "@/server/services/tokens";
import { EarlyTokenButton } from "./early-token-button";
import { TokenStateBadge } from "./token-status";

type StudentTokens = Awaited<ReturnType<typeof listStudentTokens>>;

/** Newest token with what is left to pay, and a button to open it (payments are taken there). */
export function LatestTokenCard({
  tokens,
  tokensPath,
  canPay,
}: {
  tokens: StudentTokens;
  tokensPath: string;
  canPay: boolean;
}) {
  const latest = tokens[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest token</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!latest || !latest.code ? (
          <p className="text-muted-foreground text-sm">No token yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold">{latest.code}</span>
              <TokenStateBadge state={latest.state} />
              {latest.early && <Badge variant="info">Early</Badge>}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Month</dt>
                <dd>{formatPeriod(latest.period)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Total</dt>
                <dd className="tabular-nums">{formatTaka(latest.totalPaisa)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Left to pay</dt>
                <dd className="font-semibold tabular-nums">{formatTaka(latest.remainingPaisa)}</dd>
              </div>
            </dl>
            <Button asChild className="w-fit">
              <Link href={`${tokensPath}/${latest.code}`}>{canPay ? "Open token & take payment" : "Open token"}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Every token of the student, newest first. */
export function TokenHistory({ tokens, tokensPath }: { tokens: StudentTokens; tokensPath: string }) {
  if (tokens.length === 0) return <p className="text-muted text-[13px]">No tokens yet.</p>;
  return (
    <ul className="divide-y divide-line-2 rounded-[9px] border border-line bg-surface overflow-hidden">
      {tokens.map((t) => (
        <li key={t.id}>
          <Link
            href={t.code ? `${tokensPath}/${t.code}` : `/print/tokens?token=${t.id}`}
            className="hover:bg-surface-2 flex flex-col gap-1.5 px-3.5 py-2.5 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-ink text-[14px] truncate">{formatPeriod(t.period)}</span>
                {t.early && (
                  <Badge variant="info" className="text-[10px] py-0 px-1.5 shrink-0">
                    Early
                  </Badge>
                )}
                {t.kind === "admission" && (
                  <Badge variant="info" className="text-[10px] py-0 px-1.5 shrink-0">
                    Admission
                  </Badge>
                )}
              </div>
              <span className="tabular-nums font-bold text-ink text-[15px] shrink-0">{formatTaka(t.totalPaisa)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="font-mono text-muted text-[11.5px] truncate">{t.code ?? "—"}</span>
              <div className="flex items-center gap-2 shrink-0">
                {t.paidHerePaisa > 0 && (
                  <span className="text-muted tabular-nums text-[11.5px]">paid {formatTaka(t.paidHerePaisa)}</span>
                )}
                <TokenStateBadge state={t.state} />
                <ChevronRight className="size-3.5 text-faint" />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Admin: preview and make next month's token now. That month's automatic run then skips this student. */
export async function EarlyTokenCard({
  actor,
  studentId,
  tokensPath,
}: {
  actor: SessionUser;
  studentId: string;
  tokensPath: string;
}) {
  const { plan, error } = await planEarlyToken(db(), actor.orgId, studentId, dhakaDate());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Make next month&apos;s token now (admin)</CardTitle>
        <CardDescription>
          For a student who wants to pay early. Meals up to today go in its pre meal; later days go in the token after
          it. The automatic run on the 1st will skip this student.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!plan ? (
          <p className="text-muted-foreground text-sm">{error}</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-mono font-semibold">{plan.code}</span> · {formatPeriod(plan.period)}
            </p>
            <ul className="divide-y rounded-md border text-sm">
              {plan.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-4 px-3 py-1.5">
                  <span>
                    {l.label}
                    {l.detail && <span className="text-muted-foreground ml-2 text-xs">{l.detail}</span>}
                  </span>
                  <span className="tabular-nums">{formatTaka(l.amountPaisa)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-4 px-3 py-1.5 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatTaka(plan.totalPaisa)}</span>
              </li>
            </ul>
            <EarlyTokenButton
              studentId={studentId}
              tokensPath={tokensPath}
              label={`Make ${plan.code}`}
              confirmText={`Make the ${formatPeriod(plan.period)} token ${plan.code} now? It cannot be undone.`}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
