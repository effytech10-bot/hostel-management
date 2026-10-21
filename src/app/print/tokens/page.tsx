import type { Metadata } from "next";
import { TokenCard } from "@/components/tokens/token-card";
import { isValidPeriod } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { getPrintableTokens, type PrintableToken } from "@/server/services/tokens";
import { PrintBar } from "./print-bar";
import "./print.css";

export const metadata: Metadata = { title: "Print tokens" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PrintTokensPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tokenId = one(sp.token);
  const month = one(sp.month);
  const building = one(sp.building);

  const { tokens, accounts } = await getPrintableTokens(user, {
    tokenId: tokenId && UUID_RE.test(tokenId) ? tokenId : undefined,
    period: month && isValidPeriod(month) ? month : undefined,
    buildingId: building && UUID_RE.test(building) ? building : undefined,
  }).catch(() => ({ tokens: [], accounts: [] }));

  const sheets: PrintableToken[][] = [];
  for (let i = 0; i < tokens.length; i += 4) sheets.push(tokens.slice(i, i + 4));

  return (
    <div className="bg-muted min-h-dvh py-6 print:bg-white print:py-0">
      <PrintBar count={tokens.length} />
      {tokens.length === 0 && <p className="text-center text-sm">No tokens found.</p>}
      {sheets.map((sheet, i) => (
        <section key={i} className="token-sheet">
          {sheet.map((t) => (
            <TokenCard key={t.id} token={t} orgName={user.orgName} accounts={accounts} />
          ))}
        </section>
      ))}
    </div>
  );
}
