import Link from "next/link";

/**
 * Small charts used across the app. Server-rendered (no chart library, no client JS):
 * SVG columns and HTML bars. Hovering a column or bar shows the exact value (SVG <title> / title attribute).
 *
 * Colour rules: one colour per meaning, used the same way on every page.
 * Blue = money that came in, orange = money still owed / billed. Text never takes the series colour.
 */

export const CHART = {
  in: "#3340b0",
  owed: "#c9581a",
  breakfast: "#eb6834",
  lunch: "#2a78c8",
  dinner: "#0f8a6a",
  ink: "#161a2e",
  muted: "#666d8c",
  faint: "#a3a8c0",
  grid: "#eceef5",
  axis: "#e0e3ee",
} as const;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11" → "Nov 26". */
export const shortMonth = (p: string) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;
/** "2026-11-05" → "5 Nov". */
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;

/** Taka ticks: 0 / 10K / 1.5L. Input in paisa. */
export function compact(paisa: number) {
  const t = paisa / 100;
  const a = Math.abs(t);
  const s =
    a >= 100000 ? `${+(a / 100000).toFixed(1)}L` : a >= 1000 ? `${+(a / 1000).toFixed(1)}K` : `${Math.round(a)}`;
  return `${t < 0 ? "−" : ""}${s}`;
}

export function niceScale(min: number, max: number, ticks = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= ticks) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const values: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) values.push(Math.round(v * 1000) / 1000);
  return { lo: start, hi: end, values };
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
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

/** Rectangle with only the top corners rounded (data end), bottom sits flat on the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ---------------------------------------------------------------------------
// Columns: one column per day or month, optionally stacked
// ---------------------------------------------------------------------------

export type ColumnSeries = { label: string; color: string };
export type Column = {
  key: string;
  /** Label under the column; leave empty to skip (e.g. show every 5th day only). */
  tick?: string;
  /** Hover text. */
  title: string;
  /** One value per series, stacked bottom-up in series order. */
  values: number[];
  /** Today: tick in bold. */
  mark?: boolean;
  /** A day still to come: no column, faint tick. */
  future?: boolean;
  /** Drawn lighter (e.g. meals planned for days still to come). */
  dim?: boolean;
};

export function Columns({
  cols,
  series,
  tick,
  label,
  height = 190,
  width = 720,
  maxBar = 26,
}: {
  cols: Column[];
  series: ColumnSeries[];
  /** Y-axis tick text. */
  tick: (v: number) => string;
  /** What the chart shows (for screen readers). */
  label: string;
  height?: number;
  /** Drawing width; use a smaller one (e.g. 360) in narrow cards so the text stays readable. */
  width?: number;
  maxBar?: number;
}) {
  if (cols.length === 0) return null;
  const W = width;
  const H = height;
  const pad = { l: 44, r: 6, t: 10, b: 22 };
  const totals = cols.map((c) => c.values.reduce((s, v) => s + Math.max(0, v), 0));
  const s = niceScale(0, Math.max(...totals, 0) || 1);
  const y = (v: number) => pad.t + ((s.hi - v) * (H - pad.t - pad.b)) / (s.hi - s.lo || 1);
  const slot = (W - pad.l - pad.r) / cols.length;
  const bw = Math.max(3, Math.min(maxBar, slot * 0.62));

  return (
    <figure className="m-0">
      {series.length > 1 && <Legend items={series} />}
      {/* On a phone a wide chart keeps a readable size and scrolls sideways inside its card. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          style={W > 500 ? { minWidth: Math.round(W * 0.86) } : undefined}
          role="img"
          aria-label={label}
        >
          {s.values.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? CHART.axis : CHART.grid} />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill={CHART.muted}>
                {tick(v)}
              </text>
            </g>
          ))}
          {cols.map((c, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const x = cx - bw / 2;
            let base = 0;
            const parts = c.future
              ? []
              : c.values
                  .map((v, k) => ({ v: Math.max(0, v), k }))
                  .filter((p) => p.v > 0)
                  .map((p) => {
                    const from = base;
                    base += p.v;
                    return { ...p, from, to: base };
                  });
            return (
              <g key={c.key} opacity={c.dim ? 0.4 : undefined}>
                <title>{c.title}</title>
                {/* Hit area bigger than the column so thin days are easy to hover. */}
                <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
                {parts.map((p, j) => {
                  const top = y(p.to);
                  const bottom = y(p.from);
                  // 2px surface gap between stacked pieces.
                  const h = Math.max(1, bottom - top - (j > 0 ? 2 : 0));
                  const color = series[p.k]?.color ?? CHART.in;
                  return j === parts.length - 1 ? (
                    <path key={p.k} d={topRounded(x, top, bw, h, 4)} fill={color} />
                  ) : (
                    <rect key={p.k} x={x} y={top} width={bw} height={h} fill={color} />
                  );
                })}
                {c.tick && (
                  <text
                    x={cx}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight={c.mark ? 700 : 400}
                    fill={c.mark ? CHART.ink : c.future ? CHART.faint : CHART.muted}
                  >
                    {c.tick}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** Day ticks for a month: 1, 5, 10, 15, 20, 25 and the last day (plus today). */
export function dayTick(date: string, lastDay: number, today?: string) {
  const d = Number(date.slice(8, 10));
  if (date === today || d === 1 || d === lastDay || (d % 5 === 0 && lastDay - d >= 2)) return String(d);
  return undefined;
}

// ---------------------------------------------------------------------------
// Horizontal bars: a few bars per row (e.g. per building: collected vs due)
// ---------------------------------------------------------------------------

export function RowBars({
  rows,
  series,
  format,
}: {
  rows: { key: string; label: string; href?: string; values: number[] }[];
  series: ColumnSeries[];
  format: (v: number) => string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <figure className="m-0">
      {series.length > 1 && <Legend items={series} />}
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[64px_1fr] items-center gap-3">
            <div className="truncate text-[13px] font-bold">
              {r.href ? (
                <Link href={r.href} className="text-brand hover:underline">
                  {r.label}
                </Link>
              ) : (
                <span className="text-ink">{r.label}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-[3px]">
              {r.values.map((v, k) => (
                <div
                  key={k}
                  className="flex items-center gap-2"
                  title={`${r.label} · ${series[k]?.label}: ${format(v)}`}
                >
                  <div
                    className="h-2.5 rounded-r-[4px]"
                    style={{
                      width: v > 0 ? `max(3px, calc((100% - 92px) * ${v / max}))` : "0px",
                      background: series[k]?.color,
                    }}
                  />
                  <span className="text-ink-2 shrink-0 text-[11.5px] font-medium tabular-nums">{format(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// One bar split into parts (e.g. tokens: paid / partly / unpaid)
// ---------------------------------------------------------------------------

export function SplitBar({
  parts,
  unit,
}: {
  parts: { key: string; label: string; value: number; color: string; href?: string }[];
  /** "tokens", "students" … shown in the hover text. */
  unit: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const pct = (v: number) => `${Math.round((v * 100) / total)}%`;
  return (
    <figure className="m-0 w-full">
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              title={`${p.label}: ${p.value} ${unit} (${pct(p.value)})`}
              style={{ flexGrow: p.value, flexBasis: 0, background: p.color, minWidth: 4 }}
            />
          ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {parts.map((p) => {
          const inner = (
            <>
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
              <span className="text-ink font-semibold tabular-nums">{p.value}</span>
              <span className="text-ink-2">{p.label}</span>
              <span className="text-muted tabular-nums">· {pct(p.value)}</span>
            </>
          );
          return p.href ? (
            <Link key={p.key} href={p.href} className="inline-flex items-center gap-1.5 hover:underline">
              {inner}
            </Link>
          ) : (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              {inner}
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}
