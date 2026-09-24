import { addMonths, currentPeriod, dhakaDate, isValidDate, isValidPeriod, periodStart } from "@/lib/dates";

/** Query-string parsing shared by the report pages and the CSV download, so both show the same numbers. */

export const REPORTS = ["dues", "collections", "meals", "month", "audit"] as const;
export type ReportName = (typeof REPORTS)[number];

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseReportParams(sp: SP) {
  const today = dhakaDate();
  const uuid = (k: string) => {
    const v = one(sp[k]);
    return v && UUID_RE.test(v) ? v : undefined;
  };
  const date = (k: string, fallback: string) => {
    const v = one(sp[k]);
    return v && isValidDate(v) ? v : fallback;
  };
  const month = (fallback: string) => {
    const v = one(sp.month);
    return v && isValidPeriod(v) ? v : fallback;
  };
  const r = pick(one(sp.r), REPORTS, "dues");
  let from = date("from", periodStart(currentPeriod()));
  let to = date("to", today);
  if (to < from) [from, to] = [to, from];
  return {
    r,
    building: uuid("building"),
    batch: uuid("batch"),
    status: pick(one(sp.status), ["active", "left", "all"] as const, "active"),
    show: pick(one(sp.show), ["due", "credit", "all"] as const, "due"),
    from,
    to,
    /** Meal settlement defaults to last month (the latest one that can be closed); others to this month. */
    month: month(r === "meals" ? addMonths(currentPeriod(), -1) : currentPeriod()),
    action: (one(sp.action) ?? "").replace(/[^a-z_]/g, "").slice(0, 40) || undefined,
    page: Math.max(1, Math.min(1000, Number(one(sp.page)) || 1)),
  };
}
export type ReportParams = ReturnType<typeof parseReportParams>;

/** Keep the current filters in links (tabs, CSV, paging). */
export function reportQuery(p: Partial<Record<string, string | number | undefined>>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
