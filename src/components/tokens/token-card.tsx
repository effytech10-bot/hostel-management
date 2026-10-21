import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { PrintableToken } from "@/server/services/tokens";
import "./token-card.css";

/** "September-2026" */
function monthTitle(period: string) {
  return formatPeriod(period).replace(" ", "-");
}

function Money({ paisa }: { paisa: number }) {
  return <>{paisa === 0 ? "" : formatTaka(paisa, { symbol: false })}</>;
}

function Detail({ text }: { text: string | null | undefined }) {
  return text ? <div className="token-card-detail">{text}</div> : null;
}

/**
 * The paper token, exactly as the hostel prints it (Rent, Meal Deposit, Total, Pre. Meal Balance,
 * Due:Advance/S.Charge, Due:Monthly Rent, To Be Paid), plus the token ID and the payments made on it.
 */
export function TokenCard({
  token,
  orgName,
  accounts,
  highlightPaymentId,
}: {
  token: PrintableToken;
  orgName: string;
  accounts: { name: string; details: string | null }[];
  highlightPaymentId?: string;
}) {
  const cur = (head: string) => token.current.filter((l) => l.head === head);
  const due = (...heads: string[]) => token.previous.filter((l) => heads.includes(l.head));
  const sum = (lines: { amountPaisa: number }[]) => lines.reduce((s, l) => s + l.amountPaisa, 0);
  const firstDetail = (lines: { label: string; detail: string | null }[], prefer: string) =>
    (lines.find((l) => l.label === prefer) ?? lines[0])?.detail ?? null;

  const rent = cur("rent");
  const deposit = cur("meal");
  const preMeal = due("meal");
  const advance = due("advance", "service_charge");
  const monthlyRent = due("rent");
  const other = due("other", "baburchi");
  const extra = due("credit");
  const paidPaisa = token.payments.reduce((s, p) => s + p.amountPaisa, 0);
  const leftPaisa = token.totalPaisa - paidPaisa;

  const rows: { label: string; value: React.ReactNode; detail?: string | null; strong?: boolean }[] = [
    { label: "Token ID", value: <span className="token-card-code">{token.code ?? ""}</span>, strong: true },
    { label: "Room No.", value: token.seatText },
    { label: "Rent", value: <Money paisa={sum(rent)} /> },
    { label: "Meal Deposit", value: <Money paisa={sum(deposit)} /> },
    { label: "Total", value: <Money paisa={token.currentTotalPaisa} /> },
    { label: "Pre. Meal Balance", value: <Money paisa={sum(preMeal)} />, detail: firstDetail(preMeal, "Pre meal") },
    { label: "Due:Advance/S.Charge", value: <Money paisa={sum(advance)} /> },
    {
      label: "Due:Monthly Rent",
      value: <Money paisa={sum(monthlyRent)} />,
      detail: firstDetail(monthlyRent, "Monthly due"),
    },
    ...(sum(other) !== 0 ? [{ label: "Due:Other", value: <Money paisa={sum(other)} /> }] : []),
    ...(sum(extra) !== 0 ? [{ label: "Extra Paid", value: <Money paisa={sum(extra)} /> }] : []),
  ];

  return (
    <div className="token-card">
      <div className="token-card-head">
        <div>{orgName}</div>
        <div>Building No:{token.buildingCode}</div>
        <div>Accounts of {monthTitle(token.period)}</div>
      </div>
      <div className="token-card-head token-card-sub">Student&apos;s Details</div>
      <table>
        <tbody>
          <tr>
            <td className="token-card-label">
              <b>Student Name :</b>
            </td>
            <td className="token-card-value">
              <b>{token.studentName}</b>
            </td>
            <td />
          </tr>
          {rows.map((r, i) => (
            <tr key={r.label}>
              <td className="token-card-label">{r.label}</td>
              <td className="token-card-value" style={{ fontWeight: r.strong ? 700 : undefined }}>
                {r.value}
                <Detail text={r.detail} />
              </td>
              {i === 0 && (
                <td rowSpan={rows.length + 1} className="token-card-pay">
                  {accounts.length === 0 && <div>Pay at the hostel office (cash)</div>}
                  {accounts.map((a) => (
                    <div key={a.name} style={{ marginBottom: "1mm" }}>
                      <b>{a.name}</b>
                      {a.details && <div>{a.details}</div>}
                    </div>
                  ))}
                  {accounts.length > 0 && <div>* Include Cash out cost</div>}
                </td>
              )}
            </tr>
          ))}
          <tr>
            <td className="token-card-label token-card-big">{token.totalPaisa < 0 ? "Extra Paid" : "To Be Paid"}</td>
            <td className="token-card-value token-card-big">
              {formatTaka(Math.abs(token.totalPaisa), { symbol: false })}
            </td>
          </tr>
          {token.payments.map((p) => (
            <tr key={p.id} className={p.id === highlightPaymentId ? "token-card-hl" : undefined}>
              <td className="token-card-label">
                Paid {p.paidDate.slice(8)}/{p.paidDate.slice(5, 7)} · {p.accountName}
                <div className="token-card-detail">
                  {p.receiptNo}
                  {p.trxId && ` · ${p.trxId}`}
                </div>
              </td>
              <td className="token-card-value">{formatTaka(p.amountPaisa, { symbol: false })}</td>
              <td />
            </tr>
          ))}
          {token.payments.length > 0 && (
            <tr>
              <td className="token-card-label">
                <b>{leftPaisa < 0 ? "Extra paid (next token)" : "Due after payment"}</b>
              </td>
              <td className="token-card-value">
                <b>{formatTaka(Math.abs(leftPaisa), { symbol: false })}</b>
              </td>
              <td />
            </tr>
          )}
          <tr>
            <td colSpan={2} className="token-card-note">
              N.B: You must pay your bill in 1st week of this month. Otherwise your meal service will be off from 2nd
              week.
            </td>
            <td className="token-card-note">
              *You must write your Token ID as reference &amp; collect your money receipt.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
