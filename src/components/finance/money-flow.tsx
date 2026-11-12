import { formatTaka } from "@/lib/money";
import { FUND_COLOR, FUND_LABEL, FUNDS, type Flow, type FlowNode, type Fund } from "@/server/domain/finance";

const W = 960;
const NODE_W = 12;
const GAP = 16;
const X = { left: 200, middle: 474, right: 748 };
const INK = "#161a2e";
const MUTED = "#666d8c";
const NEUTRAL = "#3a405c";

type Placed = FlowNode & { y: number; h: number };

/**
 * Money in → the three accounts → money out, as ribbons whose thickness is the amount.
 * Colour = the account the money passed through. The same numbers are in the account cards below.
 */
export function MoneyFlow({ flow }: { flow: Flow }) {
  const columns = [flow.left, flow.middle, flow.right];
  const total = (nodes: FlowNode[]) => nodes.reduce((s, n) => s + n.amountPaisa, 0);
  const most = Math.max(...columns.map((c) => c.length));
  const H = Math.max(240, most * 54);
  // One scale for all three columns, so a ribbon keeps its thickness from end to end.
  const k = Math.min(...columns.map((c) => (H - GAP * Math.max(0, c.length - 1)) / Math.max(1, total(c))));

  const place = (nodes: FlowNode[]): Placed[] => {
    const used = nodes.reduce((s, n) => s + n.amountPaisa * k, 0) + GAP * Math.max(0, nodes.length - 1);
    let y = (H - used) / 2;
    return nodes.map((n) => {
      const p = { ...n, y, h: Math.max(2, n.amountPaisa * k) };
      y += n.amountPaisa * k + GAP;
      return p;
    });
  };
  const left = place(flow.left);
  const middle = place(flow.middle);
  const right = place(flow.right);
  const byId = new Map([...left, ...middle, ...right].map((n) => [n.id, n]));
  const order = [...left, ...middle, ...right].map((n) => n.id);

  // Stack each node's ribbons in the order of the nodes they connect to, so ribbons do not cross needlessly.
  const offsetOut = new Map<string, number>();
  const offsetIn = new Map<string, number>();
  const ribbons = [...flow.links]
    .sort((a, b) => order.indexOf(a.from) - order.indexOf(b.from) || order.indexOf(a.to) - order.indexOf(b.to))
    .map((l) => {
      const s = byId.get(l.from)!;
      const t = byId.get(l.to)!;
      const h = Math.max(1, l.amountPaisa * k);
      const y0 = s.y + (offsetOut.get(l.from) ?? 0);
      offsetOut.set(l.from, (offsetOut.get(l.from) ?? 0) + l.amountPaisa * k);
      return { l, s, t, h, y0 };
    })
    .sort((a, b) => order.indexOf(a.l.to) - order.indexOf(b.l.to) || order.indexOf(a.l.from) - order.indexOf(b.l.from))
    .map((r) => {
      const y1 = r.t.y + (offsetIn.get(r.l.to) ?? 0);
      offsetIn.set(r.l.to, (offsetIn.get(r.l.to) ?? 0) + r.l.amountPaisa * k);
      const fromLeft = r.l.to.startsWith("fund:");
      const x0 = (fromLeft ? X.left : X.middle) + NODE_W;
      const x1 = fromLeft ? X.middle : X.right;
      const mx = (x0 + x1) / 2;
      const d = `M${x0},${r.y0} C${mx},${r.y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + r.h} C${mx},${y1 + r.h} ${mx},${r.y0 + r.h} ${x0},${r.y0 + r.h} Z`;
      return { ...r, d };
    });

  const moved = [...flow.left, ...flow.right].some((n) => /^(from|to):|^moved_/.test(n.id));
  const funds = FUNDS.filter((f) => flow.middle.some((n) => n.id === `fund:${f}`));
  const fundOf = (id: string) => id.slice(5) as Fund;

  if (flow.links.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No money moved in this month yet.</p>;
  }

  return (
    <figure className="m-0">
      <figcaption className="text-ink-2 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-medium">
        {funds.map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: FUND_COLOR[f] }} />
            {FUND_LABEL[f]}
          </span>
        ))}
        <span className="text-muted-foreground ml-auto text-[12px]">
          Thicker = more money. Point at a band to see the amount.
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 -34 ${W} ${H + 42}`}
          className="h-auto w-full min-w-[760px]"
          role="img"
          aria-label="Money flow: where money came from, which account it went to, and where it was spent"
        >
          <text x={X.left + NODE_W} y={-20} textAnchor="end" fontSize="11" fontWeight="600" fill={MUTED}>
            MONEY IN
          </text>
          <text x={X.middle + NODE_W / 2} y={-20} textAnchor="middle" fontSize="11" fontWeight="600" fill={MUTED}>
            ACCOUNTS
          </text>
          <text x={X.right} y={-20} fontSize="11" fontWeight="600" fill={MUTED}>
            MONEY OUT
          </text>

          {ribbons.map((r) => (
            <path
              key={`${r.l.from}>${r.l.to}`}
              d={r.d}
              fill={FUND_COLOR[r.l.fund]}
              className="opacity-25 transition-opacity hover:opacity-55"
            >
              <title>{`${r.s.label} → ${r.t.label}: ${formatTaka(r.l.amountPaisa)}`}</title>
            </path>
          ))}

          {left.map((n) => (
            <g key={n.id}>
              <rect x={X.left} y={n.y} width={NODE_W} height={n.h} rx="3" fill={NEUTRAL} />
              <text x={X.left - 10} y={n.y + n.h / 2 - 3} textAnchor="end" fontSize="13" fontWeight="600" fill={INK}>
                {n.label}
              </text>
              <text x={X.left - 10} y={n.y + n.h / 2 + 13} textAnchor="end" fontSize="12.5" fill={MUTED}>
                {formatTaka(n.amountPaisa)}
              </text>
            </g>
          ))}

          {middle.map((n) => (
            <g key={n.id}>
              <rect x={X.middle} y={n.y} width={NODE_W} height={n.h} rx="3" fill={FUND_COLOR[fundOf(n.id)]} />
              <g stroke="#fff" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke">
                <text x={X.middle + NODE_W + 8} y={n.y + n.h / 2 - 3} fontSize="13" fontWeight="700" fill={INK}>
                  {FUND_LABEL[fundOf(n.id)]}
                </text>
                <text x={X.middle + NODE_W + 8} y={n.y + n.h / 2 + 13} fontSize="12.5" fill={MUTED}>
                  {formatTaka(n.amountPaisa)}
                </text>
              </g>
            </g>
          ))}

          {right.map((n) => (
            <g key={n.id}>
              <rect x={X.right} y={n.y} width={NODE_W} height={n.h} rx="3" fill={NEUTRAL} />
              <text x={X.right + NODE_W + 10} y={n.y + n.h / 2 - 3} fontSize="13" fontWeight="600" fill={INK}>
                {n.label}
              </text>
              <text x={X.right + NODE_W + 10} y={n.y + n.h / 2 + 13} fontSize="12.5" fill={MUTED}>
                {formatTaka(n.amountPaisa)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {moved && (
        <p className="text-muted-foreground mt-2 text-[12.5px]">
          <b className="text-ink-2 font-semibold">From / To an account:</b> nobody moved money by hand. A student had
          extra money kept in one account (for example a payment above their dues), and their new token used it to pay a
          due that belongs to another account. The account cards below show the same amounts.
        </p>
      )}
    </figure>
  );
}
