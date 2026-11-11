import {
  ArrowRight,
  Ban,
  Banknote,
  BedDouble,
  Bot,
  Building,
  Calculator,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  KeyRound,
  LogOut,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Undo2,
  UserCog,
  UserPlus,
  Users,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi";
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { dhakaDate } from "@/lib/dates";
import type { ReportParams } from "@/lib/report-params";
import { reportQuery } from "@/lib/report-params";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { shiftDate } from "@/server/domain/meals";
import {
  AUDIT_CATEGORIES,
  bnDate,
  ROLE_LABEL,
  type AuditIcon,
  type AuditTone,
  type Part,
} from "@/server/domain/audit-text";
import { auditPeople, auditSummary, listAuditEntries, type AuditEntry } from "@/server/services/audit";

const ICONS: Record<AuditIcon, LucideIcon> = {
  payment: Banknote,
  void: Ban,
  refund: Undo2,
  adjust: Scale,
  account: Wallet,
  token: Ticket,
  admit: UserPlus,
  leave: LogOut,
  student: UserCog,
  password: KeyRound,
  meal: Utensils,
  holiday: CalendarOff,
  building: Building,
  seat: BedDouble,
  rates: Calculator,
  settings: Settings,
  user: Users,
  other: Circle,
};

const TONE: Record<AuditTone, string> = {
  ok: "bg-ok-bg text-ok border-ok-line",
  bad: "bg-bad-bg text-bad border-bad-line",
  warn: "bg-warn-bg text-warn border-warn-line",
  info: "bg-brand-50 text-brand border-brand-100",
  auto: "bg-auto-50 text-auto border-[#dccbf0]",
  neutral: "bg-surface-3 text-ink-2 border-line",
};

const ROLE_STYLE: Record<AuditEntry["actor"]["role"], string> = {
  admin: "bg-admin-50 text-admin",
  cashier: "bg-cashier-50 text-cashier",
  student: "bg-student-50 text-student",
  system: "bg-auto-50 text-auto",
};

const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit" });

function dayLabel(day: string, today: string, yesterday: string) {
  if (day === today) return `আজ · ${bnDate(day)}`;
  if (day === yesterday) return `গতকাল · ${bnDate(day)}`;
  return bnDate(day);
}

function Sentence({ parts }: { parts: Part[] }) {
  return (
    <p className="text-ink text-[14.5px] leading-relaxed">
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : p.href ? (
          <Link key={i} href={p.href} className="text-brand font-semibold hover:underline">
            {p.b}
          </Link>
        ) : (
          <b key={i} className="font-semibold">
            {p.b}
          </b>
        ),
      )}
    </p>
  );
}

function Entry({ e }: { e: AuditEntry }) {
  const Icon = ICONS[e.icon];
  return (
    <li className="flex gap-3 py-3.5">
      <span
        className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border", TONE[e.tone])}
        aria-hidden
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <Sentence parts={e.sentence} />

        <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <span className="font-mono tabular-nums">{TIME.format(e.at)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            {e.actor.role === "system" ? <Bot className="size-3.5" /> : null}
            <span className="text-ink-2 font-medium">{e.actor.name}</span>
            {e.actor.role !== "system" && (
              <span className={cn("rounded-full px-1.5 py-px text-[11px] font-bold", ROLE_STYLE[e.actor.role])}>
                {ROLE_LABEL[e.actor.role]}
              </span>
            )}
          </span>
        </div>

        {e.changes.length > 0 && (
          <ul className="border-line-2 bg-surface-2 mt-2 flex flex-col gap-1.5 rounded-[10px] border p-2.5 text-[13px]">
            {e.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted min-w-28">{c.label}</span>
                <span className="text-bad line-through decoration-1">{c.from}</span>
                <ArrowRight className="text-faint size-3.5 shrink-0" aria-label="থেকে বদলে" />
                <span className="text-ok font-semibold">{c.to}</span>
              </li>
            ))}
          </ul>
        )}

        {e.facts.length > 0 && (
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
            {e.facts.map((f, i) => (
              <div key={i} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd className="text-ink-2 mb-1 font-medium [overflow-wrap:anywhere] sm:mb-0">
                  {f.href ? (
                    <Link href={f.href} className="text-brand font-mono hover:underline">
                      {f.value}
                    </Link>
                  ) : (
                    f.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

export async function AuditReport({ actor, area, p }: { actor: SessionUser; area: string; p: ReportParams }) {
  const filters = {
    cat: p.cat,
    who: p.who,
    q: p.q,
    from: p.datesSet ? p.from : undefined,
    to: p.datesSet ? p.to : undefined,
    page: p.page,
  };
  const [data, summary, people] = await Promise.all([
    listAuditEntries(actor, filters, area),
    auditSummary(actor, filters),
    auditPeople(actor),
  ]);

  const base = `${area}/reports`;
  const keep = {
    r: "audit",
    cat: p.cat,
    who: p.who,
    q: p.q,
    from: p.datesSet ? p.from : undefined,
    to: p.datesSet ? p.to : undefined,
  };
  const filtered = !!(p.cat || p.who || p.q || p.datesSet);

  const today = dhakaDate();
  const yesterday = shiftDate(today, -1);
  const days: { day: string; entries: AuditEntry[] }[] = [];
  for (const e of data.entries) {
    const day = dhakaDate(e.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(e);
    else days.push({ day, entries: [e] });
  }

  return (
    <div className="flex flex-col gap-5">
      <Note variant="info" icon={<ShieldCheck className="text-brand size-5" />}>
        <p className="font-semibold">সফটওয়্যারে কে কখন কী করেছে, সব এখানে লেখা থাকে।</p>
        <p className="text-ink-2 text-[12.5px]">
          টাকা নেওয়া, পেমেন্ট বাতিল, ভর্তি, মিল বন্ধ, রেট বদল সবকিছু। এই লেখা কেউ মুছতে বা বদলাতে পারে না।
        </p>
      </Note>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile
          label={filtered ? "মোট ঘটনা (এই ফিল্টারে)" : "মোট ঘটনা"}
          value={summary.total}
          className="col-span-2 md:col-span-1"
        />
        <KpiTile
          label="টাকা নেওয়া হয়েছে"
          value={summary.payments}
          note="বার"
          href={`${base}${reportQuery({ ...keep, cat: "money" })}`}
        />
        <KpiTile
          label="পেমেন্ট বাতিল"
          value={summary.voids}
          note="বার"
          tone={summary.voids > 0 ? "red" : "default"}
          href={`${base}${reportQuery({ ...keep, cat: "money" })}`}
        />
        <KpiTile
          label="নতুন ভর্তি"
          value={summary.admits}
          note="জন"
          tone="green"
          href={`${base}${reportQuery({ ...keep, cat: "student" })}`}
        />
        <KpiTile
          label="ছেড়ে গেছে"
          value={summary.leaves}
          note="জন"
          href={`${base}${reportQuery({ ...keep, cat: "student" })}`}
        />
      </div>

      {/* What: category chips */}
      <nav className="flex flex-wrap gap-1.5" aria-label="কী ধরনের কাজ">
        {[{ key: undefined, label: "সব" }, ...AUDIT_CATEGORIES].map((c) => {
          const active = (p.cat ?? undefined) === c.key;
          return (
            <Link
              key={c.key ?? "all"}
              href={`${base}${reportQuery({ ...keep, cat: c.key, page: undefined })}`}
              className={cn(
                "rounded-[20px] border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      {/* Who / when / which student */}
      <form
        method="get"
        className="bg-surface border-line shadow-card flex flex-wrap items-end gap-3 rounded-[12px] border p-3.5"
      >
        <input type="hidden" name="r" value="audit" />
        {p.cat && <input type="hidden" name="cat" value={p.cat} />}
        <div className="flex flex-col gap-1">
          <Label htmlFor="who" className="text-ink-2 text-[12.5px] font-semibold">
            কে করেছে
          </Label>
          <Select id="who" name="who" defaultValue={p.who ?? ""} className="h-9 w-auto min-w-44 text-[13.5px]">
            <option value="">সবাই</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({ROLE_LABEL[m.role] ?? m.role})
              </option>
            ))}
            <option value="students">যেকোনো ছাত্র (নিজের ফোন থেকে)</option>
            <option value="system">সিস্টেম (অটো)</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="from" className="text-ink-2 text-[12.5px] font-semibold">
            তারিখ থেকে
          </Label>
          <Input id="from" type="date" name="from" defaultValue={p.datesSet ? p.from : ""} className="h-9 w-auto" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to" className="text-ink-2 text-[12.5px] font-semibold">
            তারিখ পর্যন্ত
          </Label>
          <Input id="to" type="date" name="to" defaultValue={p.datesSet ? p.to : ""} className="h-9 w-auto" />
        </div>
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          <Label htmlFor="q" className="text-ink-2 text-[12.5px] font-semibold">
            ছাত্র খুঁজুন
          </Label>
          <Input id="q" name="q" defaultValue={p.q ?? ""} placeholder="নাম, Student ID বা ফোন" className="h-9" />
        </div>
        <Button type="submit" size="sm" className="h-9 gap-1.5">
          <Search className="size-3.5" />
          দেখুন
        </Button>
        {filtered && (
          <Button asChild variant="ghost" size="sm" className="h-9 gap-1">
            <Link href={`${base}${reportQuery({ r: "audit" })}`}>
              <X className="size-3.5" />
              সব ফিল্টার মুছুন
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="ml-auto h-9 gap-1.5">
          <a href={`/api/reports/csv${reportQuery(keep)}`}>
            <Download className="size-3.5" />
            Excel-এ নামান
          </a>
        </Button>
      </form>

      <Card className="py-0">
        <CardContent className="px-4 py-1 sm:px-5">
          {days.length === 0 ? (
            <p className="text-muted py-10 text-center text-[14px]">
              {filtered ? "এই ফিল্টারে কিছু পাওয়া যায়নি।" : "এখনো কিছু লেখা হয়নি।"}
            </p>
          ) : (
            days.map((d) => (
              <section key={d.day}>
                <h3 className="bg-surface text-ink-2 border-line-2 sticky top-0 z-[1] flex items-center justify-between border-b pt-4 pb-2 text-[13px] font-bold">
                  <span>{dayLabel(d.day, today, yesterday)}</span>
                  <span className="text-muted font-medium">{d.entries.length}টা কাজ</span>
                </h3>
                <ul className="divide-line-2 flex flex-col divide-y">
                  {d.entries.map((e) => (
                    <Entry key={e.id} e={e} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </CardContent>
      </Card>

      {(data.page > 1 || data.hasMore) && (
        <div className="flex items-center justify-between gap-2">
          {data.page > 1 ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`${base}${reportQuery({ ...keep, page: data.page - 1 })}`}>
                <ChevronLeft className="size-4" />
                আরও নতুন
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted text-[12.5px]">পাতা {data.page}</span>
          {data.hasMore ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`${base}${reportQuery({ ...keep, page: data.page + 1 })}`}>
                আরও পুরনো
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
