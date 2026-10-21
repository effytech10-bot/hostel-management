import { UserRound } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/validation/payments";
import type { PrintableToken } from "@/server/services/tokens";
import type { MyStudent } from "@/server/services/student-portal";
import { TokenStateBadge } from "@/components/tokens/token-status";
import type { TokenState } from "@/server/domain/tokens";

export function seatText(me: MyStudent) {
  return me.current
    ? `${me.current.buildingCode} · Room ${me.current.roomNumber} · Seat ${me.current.seatLabel}`
    : null;
}

/** Photo, name, ID and seat. */
export function StudentStrip({ me }: { me: MyStudent }) {
  return (
    <div className="flex items-center gap-4">
      {me.photoUrl ? (
        // Signed, short-lived URL from private storage: next/image would cache it, so a plain img is used.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.photoUrl} alt="" className="size-16 shrink-0 rounded-full border object-cover" />
      ) : (
        <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-full">
          <UserRound className="size-8" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{me.fullName}</p>
        <p className="text-muted-foreground text-sm">
          ID <span className="text-foreground font-medium">{me.studentCode}</span>
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

/** The one number a student cares about most. */
export function DueNow({ totalPaisa }: { totalPaisa: number }) {
  if (totalPaisa > 0) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-900">
        <p className="text-sm">You need to pay</p>
        <p className="text-4xl font-semibold tabular-nums">{formatTaka(totalPaisa)}</p>
      </div>
    );
  }
  if (totalPaisa < 0) {
    return (
      <div className="rounded-xl bg-emerald-50 p-5 text-emerald-900">
        <p className="text-sm">Nothing to pay. You have extra (credit)</p>
        <p className="text-4xl font-semibold tabular-nums">{formatTaka(-totalPaisa)}</p>
        <p className="mt-1 text-xs">This will be used for your next bill.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-emerald-50 p-5 text-emerald-900">
      <p className="text-sm">Nothing to pay</p>
      <p className="text-4xl font-semibold">All paid ✓</p>
    </div>
  );
}

/** The newest token, for the phone. */
export function TokenView({
  token,
  state,
  remainingPaisa,
}: {
  token: PrintableToken;
  state: TokenState;
  remainingPaisa: number;
}) {
  const section = (title: string, lines: PrintableToken["current"]) =>
    lines.length > 0 && (
      <>
        <li className="text-muted-foreground pt-2 text-xs font-semibold uppercase">{title}</li>
        {lines.map((l, i) => (
          <li key={`${title}${i}`} className="flex justify-between gap-4 border-b py-1.5">
            <span>
              {l.label}
              {l.detail && <span className="text-muted-foreground ml-2 text-xs">{l.detail}</span>}
            </span>
            <span className="tabular-nums">{formatTaka(l.amountPaisa)}</span>
          </li>
        ))}
      </>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          <span className="font-mono">{token.code}</span>{" "}
          <span className="text-muted-foreground font-normal">· {formatPeriod(token.period)}</span>
        </p>
        <TokenStateBadge state={state} />
      </div>
      <ul className="flex flex-col text-sm">
        {section("This month", token.current)}
        {section("Due", token.previous)}
        <li className="flex justify-between gap-4 py-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatTaka(token.totalPaisa)}</span>
        </li>
      </ul>
      {token.payments.length > 0 && (
        <div className="text-sm">
          <p className="text-muted-foreground text-xs font-semibold uppercase">Paid</p>
          {token.payments.map((p, i) => (
            <div key={i} className="flex justify-between gap-4 py-1">
              <span>
                {p.paidDate} · {p.accountName}
                {p.trxId && <span className="text-muted-foreground ml-1 font-mono text-xs">{p.trxId}</span>}
              </span>
              <span className="tabular-nums">{formatTaka(p.amountPaisa)}</span>
            </div>
          ))}
        </div>
      )}
      {state !== "paid" && (
        <p className="text-sm">
          Left to pay: <span className="font-semibold tabular-nums">{formatTaka(remainingPaisa)}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        {token.code && (
          <Link href={`/student/tokens/${token.code}`} className="text-primary hover:underline">
            Open token
          </Link>
        )}
        <Link href={`/print/tokens?token=${token.id}`} target="_blank" className="text-primary hover:underline">
          Print / save
        </Link>
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
    <div className="flex flex-col gap-3 text-sm">
      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-md border px-3 py-2">
              <p className="font-medium">
                {a.name} <span className="text-muted-foreground font-normal">· {METHOD_LABEL[a.method]}</span>
              </p>
              {a.details && <p className="font-mono text-base break-all select-all">{a.details}</p>}
            </li>
          ))}
        </ul>
      )}
      <p>
        {accounts.length > 0 ? "Or pay cash at the hostel office. " : "Pay at the hostel office. "}
        When you send money, write your token ID{" "}
        <span className="font-mono font-semibold">{tokenCode ?? studentCode}</span> in the reference.
      </p>
      <p className="text-muted-foreground">
        The office checks and records your payment. Then a receipt appears in your account here.
      </p>
    </div>
  );
}
