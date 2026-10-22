import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/validation/payments";
import type { PrintableToken } from "@/server/services/tokens";
import type { MyStudent } from "@/server/services/student-portal";
import { TokenCard } from "@/components/tokens/token-card";
import { TokenStateBadge } from "@/components/tokens/token-status";
import type { TokenState } from "@/server/domain/tokens";

export function seatText(me: MyStudent) {
  return me.current
    ? `${me.current.buildingCode} · Room ${me.current.roomNumber} · Seat ${me.current.seatLabel}`
    : null;
}

/** Photo, name, ID and seat. Matches prototype student profile strip. */
export function StudentStrip({ me }: { me: MyStudent }) {
  return (
    <div className="flex items-center gap-3">
      {me.photoUrl ? (
        // Signed, short-lived URL from private storage: next/image would cache it, so a plain img is used.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.photoUrl} alt="" className="size-14 shrink-0 rounded-full border border-line object-cover" />
      ) : (
        <div
          className="grid size-14 shrink-0 place-items-center rounded-full text-[20px] font-bold text-white select-none"
          style={{ backgroundColor: "#c9581a" }}
        >
          {me.fullName[0]?.toUpperCase() ?? "S"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold text-ink leading-tight">{me.fullName}</p>
        <p className="text-muted text-[12.5px] mt-0.5 truncate">
          ID <span className="font-mono font-medium text-ink-2">{me.studentCode}</span>
          {seatText(me) ? ` · ${seatText(me)}` : ""}
        </p>
        {me.status === "left" && (
          <Badge variant="secondary" className="mt-1">
            Left on {me.leftDate}
          </Badge>
        )}
      </div>
    </div>
  );
}

/** The one number a student cares about most. Radius 14, padding 16, 32px bold tabular. */
export function DueNow({ totalPaisa }: { totalPaisa: number }) {
  if (totalPaisa > 0) {
    return (
      <div className="rounded-[14px] p-4 bg-[#fdecec] text-[#7f1d1d] shadow-xs">
        <p className="text-[13px] font-medium leading-none mb-1.5">You need to pay</p>
        <p className="text-[32px] font-bold tabular-nums leading-none tracking-tight">{formatTaka(totalPaisa)}</p>
      </div>
    );
  }
  if (totalPaisa < 0) {
    return (
      <div className="rounded-[14px] p-4 bg-[#e8f7ed] text-[#14532d] shadow-xs">
        <p className="text-[13px] font-medium leading-none mb-1.5">Nothing to pay. You have extra (credit)</p>
        <p className="text-[32px] font-bold tabular-nums leading-none tracking-tight">{formatTaka(-totalPaisa)}</p>
        <p className="mt-1.5 text-[11.5px] opacity-85">This will be used for your next bill.</p>
      </div>
    );
  }
  return (
    <div className="rounded-[14px] p-4 bg-[#e8f7ed] text-[#14532d] shadow-xs">
      <p className="text-[13px] font-medium leading-none mb-1.5">Nothing to pay</p>
      <p className="text-[32px] font-bold leading-none tracking-tight">All paid ✓</p>
    </div>
  );
}

/** The newest token, for the phone. */
export function TokenView({
  token,
  state,
  remainingPaisa,
  orgName,
  accounts,
}: {
  token: PrintableToken;
  state: TokenState;
  remainingPaisa: number;
  orgName: string;
  accounts: { name: string; details: string | null }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[14px] font-bold text-ink">{token.code}</p>
        <TokenStateBadge state={state} />
      </div>
      <div className="w-full overflow-hidden rounded-[8px] border border-line bg-surface p-2 shadow-xs">
        <TokenCard token={token} orgName={orgName} accounts={accounts} />
      </div>
      {state !== "paid" && (
        <p className="text-[13px] text-ink-2">
          Left to pay: <span className="font-bold tabular-nums text-bad">{formatTaka(remainingPaisa)}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-[13px]">
        {token.code && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/student/tokens/${token.code}`}>Open token</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/print/tokens?token=${token.id}`} target="_blank">
            Print / save
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function HowToPay({
  accounts,
  studentCode,
  tokenCode,
}: {
  accounts: { id: string; name: string; method: keyof typeof METHOD_LABEL; details: string | null }[];
  studentCode: string;
  tokenCode?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-[8px] border border-line bg-surface p-[8px_10px]">
              <p className="text-[13px] font-bold text-ink">
                {a.name} <span className="text-muted font-normal text-[11.5px]">· {METHOD_LABEL[a.method]}</span>
              </p>
              {a.details && (
                <p className="font-mono text-[15px] font-semibold text-ink break-all select-all mt-0.5">{a.details}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12.5px] text-ink-2 leading-relaxed">
        {accounts.length > 0 ? "Or pay cash at the hostel office. " : "Pay at the hostel office. "}
        When you send money, write your token ID{" "}
        <span className="font-mono font-bold text-ink">{tokenCode ?? studentCode}</span> in the reference.
      </p>
      <p className="text-muted text-[11.5px] leading-relaxed">
        The office checks and records your payment. Then a receipt appears in your account here.
      </p>
    </div>
  );
}
