import type { Metadata } from "next";
import { formatPeriod, isValidPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { getPrintableTokens, type PrintableToken } from "@/server/services/tokens";
import { PrintBar } from "./print-bar";
import "./print.css";

export const metadata: Metadata = { title: "Print tokens" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function monthTitle(period: string) {
  return formatPeriod(period).replace(" ", "-");
}

function Money({ paisa }: { paisa: number }) {
  return <>{formatTaka(paisa, { symbol: false })}</>;
}

function TokenCard({
  token,
  orgName,
  accounts,
}: {
  token: PrintableToken;
  orgName: string;
  accounts: { name: string; details: string | null }[];
}) {
  const rows: { label: string; value: React.ReactNode; bold?: boolean }[] = [
    { label: "Student Name", value: token.studentName, bold: true },
    { label: "Student ID", value: token.studentCode },
    { label: "Room / Seat", value: token.seatText },
    ...token.current.map((l) => ({ label: l.label, value: <Money paisa={l.amountPaisa} /> })),
    { label: "This month total", value: <Money paisa={token.currentTotalPaisa} />, bold: true },
    ...token.previous.map((l) => ({ label: l.label, value: <Money paisa={l.amountPaisa} /> })),
  ];

  return (
    <div className="token-card">
      <div style={{ textAlign: "center", padding: "1.5mm", fontWeight: 700 }}>
        <div style={{ fontSize: "11pt" }}>{orgName}</div>
        <div>Building No: {token.buildingCode}</div>
        <div>
          {token.kind === "admission" ? "Admission bill" : "Accounts of"} {monthTitle(token.period)}
        </div>
      </div>
      <table style={{ flex: 1 }}>
        <tbody>
          <tr>
            <td style={{ width: "62%", padding: 0 }}>
              <table>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ width: "55%", borderTop: i === 0 ? "none" : undefined }}>{r.label}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: r.bold ? 700 : 400,
                          borderTop: i === 0 ? "none" : undefined,
                        }}
                      >
                        {r.value}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700, fontSize: "10.5pt" }}>
                      {token.totalPaisa < 0 ? "Credit (nothing to pay)" : "To Be Paid"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: "11pt" }}>
                      <Money paisa={Math.abs(token.totalPaisa)} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td style={{ fontSize: "8.5pt" }}>
              <div style={{ fontWeight: 700, marginBottom: "1mm" }}>Pay to</div>
              {accounts.length === 0 && <div>Hostel office (cash)</div>}
              {accounts.map((a) => (
                <div key={a.name} style={{ marginBottom: "1.2mm" }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  {a.details && <div>{a.details}</div>}
                </div>
              ))}
              {accounts.length > 0 && <div>* Include cash out cost</div>}
            </td>
          </tr>
          <tr>
            <td style={{ fontSize: "8pt" }}>
              N.B.: Pay your bill in the 1st week of this month. Otherwise your meal service will be off from the 2nd
              week.
            </td>
            <td style={{ fontSize: "8pt" }}>
              Write your name, Student ID and building as the reference, and collect your money receipt.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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
