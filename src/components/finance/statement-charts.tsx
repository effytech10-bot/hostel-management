import { formatTaka } from "@/lib/money";
import { FUND_COLOR, FUND_LABEL, FUNDS, type Fund } from "@/server/domain/finance";
import type { CashStep } from "@/server/domain/income-statement";

/** Small SVG charts for the income statement. Server-rendered; hover shows the exact amount (SVG title). */

const INK = "#161a2e";
const MUTED = "#666d8c";
const GRID = "#eceef5";
const AXIS = "#e0e3ee";
const SPENT = "#9aa0ba";
const OK = "#15803d";
const BAD = "#b42323";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (p: string) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;

/** 0 / 10K / 20K style ticks. */
function compact(paisa: number) {
  const t = paisa / 100;
  const a = Math.abs(t);
  const s =
    a >= 100000 ? `${+(a / 100000).toFixed(1)}L` : a >= 1000 ? `${+(a / 1000).toFixed(1)}K` : `${Math.round(a)}`;
  return `${t < 0 ? "−" : ""}${s}`;
}

function niceScale(min: number, max: number, ticks = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= ticks) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const values: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) values.push(Math.round(v));
  return { lo: start, hi: end, values };
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="text-ink-2 mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profit per month, one line per account
// ---------------------------------------------------------------------------

export function ProfitTrend({ trend }: { trend: { period: string; funds: { fund: Fund; profitPaisa: number }[] }[] }) {
  if (trend.length === 0) return null;
  const W = 640;
  const H = 220;
  const pad = { l: 46, r: 120, t: 12, b: 26 };
  const values = trend.flatMap((m) => m.funds.map((f) => f.profitPaisa));
  const s = niceScale(Math.min(...values), Math.max(...values));
  const x = (i: number) =>
    pad.l + (trend.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (trend.length - 1));
  const y = (v: number) => pad.t + ((s.hi - v) * (H - pad.t - pad.b)) / (s.hi - s.lo || 1);
  const series = FUNDS.map((f) => ({
    fund: f,
    points: trend.map((m, i) => ({ i, period: m.period, v: m.funds.find((x) => x.fund === f)?.profitPaisa ?? 0 })),
  }));
  // End labels must not sit on top of each other.
  const ends = series
    .map((sr) => ({ fund: sr.fund, y: y(sr.points[sr.points.length - 1].v), v: sr.points[sr.points.length - 1].v }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;

  return (
    <figure className="m-0">
      <Legend items={FUNDS.map((f) => ({ label: FUND_LABEL[f], color: FUND_COLOR[f] }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Profit per month of each account">
        {s.values.map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? AXIS : GRID}
              strokeWidth={v === 0 ? 1.5 : 1}
            />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>
              {compact(v)}
            </text>
          </g>
        ))}
        {trend.map((m, i) => (
          <text key={m.period} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={MUTED}>
            {shortMonth(m.period)}
          </text>
        ))}
        {series.map((sr) => (
          <g key={sr.fund}>
            <polyline
              fill="none"
              stroke={FUND_COLOR[sr.fund]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={sr.points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
            />
            {sr.points.map((p) => (
              <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="4" fill={FUND_COLOR[sr.fund]} stroke="#fff" strokeWidth="2">
                <title>{`${FUND_LABEL[sr.fund]} · ${shortMonth(p.period)}: profit ${formatTaka(p.v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {ends.map((e) => (
          <text key={e.fund} x={W - pad.r + 10} y={e.y + 4} fontSize="11.5" fill={INK} fontWeight="600">
            {formatTaka(e.v)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Earned vs spent per month for one account
// ---------------------------------------------------------------------------

export function EarnedSpentColumns({
  fund,
  trend,
}: {
  fund: Fund;
  trend: { period: string; funds: { fund: Fund; earnedPaisa: number; spentPaisa: number }[] }[];
}) {
  if (trend.length === 0) return null;
  const W = 360;
  const H = 170;
  const pad = { l: 40, r: 6, t: 8, b: 24 };
  const rows = trend.map((m) => ({ period: m.period, ...m.funds.find((f) => f.fund === fund)! }));
  const s = niceScale(0, Math.max(...rows.flatMap((r) => [r.earnedPaisa, r.spentPaisa]), 1));
  const band = (W - pad.l - pad.r) / rows.length;
  const bw = Math.min(14, band / 3);
  const y = (v: number) => pad.t + ((s.hi - Math.max(0, v)) * (H - pad.t - pad.b)) / (s.hi - s.lo || 1);
  const base = y(0);
  const col = (cx: number, v: number, color: string, title: string) => {
    const top = y(v);
    const h = Math.max(0, base - top);
    if (h <= 0) return null;
    const r = Math.min(4, h);
    return (
      <path
        d={`M${cx},${base} V${top + r} Q${cx},${top} ${cx + r},${top} H${cx + bw - r} Q${cx + bw},${top} ${cx + bw},${top + r} V${base} Z`}
        fill={color}
      >
        <title>{title}</title>
      </path>
    );
  };
  return (
    <figure className="m-0">
      <Legend
        items={[
          { label: "Earned", color: FUND_COLOR[fund] },
          { label: "Spent", color: SPENT },
        ]}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Earned and spent per month">
        {s.values.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? AXIS : GRID} />
            <text x={pad.l - 5} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill={MUTED}>
              {compact(v)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = pad.l + i * band + band / 2;
          return (
            <g key={r.period}>
              {col(
                cx - bw - 1,
                r.earnedPaisa,
                FUND_COLOR[fund],
                `${shortMonth(r.period)} earned ${formatTaka(r.earnedPaisa)}`,
              )}
              {col(cx + 1, r.spentPaisa, SPENT, `${shortMonth(r.period)} spent ${formatTaka(r.spentPaisa)}`)}
              <text x={cx} y={H - 7} textAnchor="middle" fontSize="10.5" fill={MUTED}>
                {shortMonth(r.period)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Cash of the month as a waterfall
// ---------------------------------------------------------------------------

/** Running total of every step, so each bar starts where the last one ended. */
function waterfallBars(steps: CashStep[]) {
  const out: (CashStep & { from: number; to: number })[] = [];
  let run = 0;
  for (const s of steps) {
    if (s.kind === "start" || s.kind === "end") {
      run = s.amountPaisa;
      out.push({ ...s, from: 0, to: s.amountPaisa });
    } else {
      out.push({ ...s, from: run, to: run + s.amountPaisa });
      run += s.amountPaisa;
    }
  }
  return out;
}

export function CashWaterfall({ steps }: { steps: CashStep[] }) {
  const W = 400;
  const rowH = 26;
  const H = steps.length * rowH + 4;
  const labelW = 178;
  const valueW = 82;
  const bars = waterfallBars(steps);
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const x0 = labelW;
  const x1 = W - valueW;
  const x = (v: number) => x0 + ((v - lo) * (x1 - x0)) / (hi - lo || 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Cash of the month, step by step">
      {bars.map((b, i) => {
        const yy = i * rowH + 4;
        const a = x(Math.min(b.from, b.to));
        const w = Math.max(2, Math.abs(x(b.to) - x(b.from)));
        const color = b.kind === "in" ? OK : b.kind === "out" ? BAD : "#3a405c";
        const sign = b.kind === "in" ? "+" : b.kind === "out" ? "−" : "";
        return (
          <g key={b.key}>
            <text
              x={0}
              y={yy + 14}
              fontSize="11.5"
              fill={b.kind === "start" || b.kind === "end" ? INK : MUTED}
              fontWeight={b.kind === "end" ? 700 : 500}
            >
              {b.label.length > 30 ? `${b.label.slice(0, 29)}…` : b.label}
              <title>{b.label}</title>
            </text>
            <rect
              x={a}
              y={yy + 3}
              width={w}
              height={rowH - 10}
              rx="3"
              fill={color}
              opacity={b.kind === "start" || b.kind === "end" ? 0.85 : 0.75}
            >
              <title>{`${b.label}: ${sign}${formatTaka(Math.abs(b.amountPaisa))}`}</title>
            </rect>
            <text
              x={W}
              y={yy + 14}
              textAnchor="end"
              fontSize="11.5"
              fill={INK}
              fontWeight={b.kind === "end" ? 700 : 500}
            >
              {sign}
              {formatTaka(Math.abs(b.amountPaisa))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Expenses by category (one account)
// ---------------------------------------------------------------------------

export function ExpenseBars({ fund, rows }: { fund: Fund; rows: { label: string; monthPaisa: number }[] }) {
  const list = rows.filter((r) => r.monthPaisa > 0).sort((a, b) => b.monthPaisa - a.monthPaisa);
  if (list.length === 0) return <p className="text-muted-foreground text-[12.5px]">No expenses this month.</p>;
  const max = Math.max(...list.map((r) => r.monthPaisa));
  const total = list.reduce((s, r) => s + r.monthPaisa, 0);
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-[12.5px]">
          <span className="text-ink-2 truncate">{r.label}</span>
          <span
            className="bg-surface-3 h-2.5 overflow-hidden rounded-full"
            title={`${r.label}: ${formatTaka(r.monthPaisa)}`}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(3, (r.monthPaisa / max) * 100)}%`, background: FUND_COLOR[fund] }}
            />
          </span>
          <span className="text-ink tabular-nums">
            {formatTaka(r.monthPaisa)}{" "}
            <span className="text-muted-foreground">({Math.round((r.monthPaisa / total) * 100)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Part of a whole (collected / expected)
// ---------------------------------------------------------------------------

export function PartOfWhole({
  label,
  part,
  whole,
  fund,
  format = formatTaka,
}: {
  label: string;
  part: number;
  whole: number;
  fund: Fund;
  format?: (v: number) => string;
}) {
  const pct = whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
  return (
    <div className="text-[12.5px]">
      <div className="mb-1 flex justify-between gap-2">
        <span className="text-ink-2">{label}</span>
        <span className="text-ink tabular-nums">
          {format(part)} of {format(whole)} · <b>{pct}%</b>
        </span>
      </div>
      <div className="bg-surface-3 h-2.5 overflow-hidden rounded-full" title={`${pct}%`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: FUND_COLOR[fund] }} />
      </div>
    </div>
  );
}
