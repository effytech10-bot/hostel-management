/**
 * Turns raw audit rows ("payment.create" + JSON) into plain Bangla sentences an office admin can read.
 * Pure functions: names of students, buildings, rooms etc. come in through `AuditLookups`.
 */
import { formatTaka } from "@/lib/money";

// ---------------------------------------------------------------------------
// Categories (the filter tabs)
// ---------------------------------------------------------------------------

export const AUDIT_CATEGORIES = [
  { key: "money", label: "টাকা ও পেমেন্ট", prefixes: ["payment.", "payment_account.", "refund.", "ledger."] },
  { key: "token", label: "টোকেন", prefixes: ["billing.", "token."] },
  { key: "student", label: "ছাত্র", prefixes: ["student."] },
  { key: "meal", label: "মিল", prefixes: ["meal."] },
  { key: "building", label: "বিল্ডিং ও সিট", prefixes: ["building.", "room.", "seat."] },
  { key: "settings", label: "রেট ও সেটিংস", prefixes: ["rates.", "settings."] },
  { key: "user", label: "ইউজার ও পাসওয়ার্ড", prefixes: ["membership."] },
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]["key"] | "other";

export function categoryOf(action: string): AuditCategory {
  for (const c of AUDIT_CATEGORIES) if (c.prefixes.some((p) => action.startsWith(p))) return c.key;
  return "other";
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

/** "2026-11" → "নভেম্বর 2026" */
export function bnPeriod(period: unknown): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period ?? ""));
  return m ? `${BN_MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(period ?? "");
}

/** "2026-10-23" → "23 অক্টোবর 2026" */
export function bnDate(date: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  return m ? `${Number(m[3])} ${BN_MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(date ?? "");
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "অ্যাডমিন",
  cashier: "ক্যাশিয়ার",
  student: "ছাত্র",
  system: "সিস্টেম (অটো)",
};

const SLOT: Record<string, string> = {
  breakfast: "সকালের নাস্তা",
  lunch: "দুপুরের খাবার",
  dinner: "রাতের খাবার",
};

const HEAD: Record<string, string> = {
  rent: "ভাড়া",
  meal: "মিল",
  baburchi: "বাবুর্চি বিল",
  service_charge: "সার্ভিস চার্জ",
  advance: "অ্যাডভান্স",
  other: "অন্যান্য",
  credit: "বাড়তি জমা",
};

const METHOD: Record<string, string> = { cash: "ক্যাশ", bkash: "বিকাশ", nagad: "নগদ", rocket: "রকেট", bank: "ব্যাংক" };

const taka = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? formatTaka(Math.round(n)) : "—";
};

const hourText = (h: unknown) => {
  if (h === null || h === undefined) return "অনুমতি নেই (শুধু অফিস)";
  const n = Number(h);
  if (!Number.isFinite(n)) return String(h);
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return `আগের রাত ${h12}টা পর্যন্ত`;
};

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/** A piece of the sentence: plain text, or a bold (optionally linked) name/amount. */
export type Part = string | { b: string; href?: string };

export type AuditTone = "ok" | "bad" | "warn" | "info" | "auto" | "neutral";

export type AuditIcon =
  | "payment"
  | "void"
  | "refund"
  | "adjust"
  | "account"
  | "token"
  | "admit"
  | "leave"
  | "student"
  | "password"
  | "meal"
  | "holiday"
  | "building"
  | "seat"
  | "rates"
  | "settings"
  | "user"
  | "other";

export type AuditView = {
  category: AuditCategory;
  icon: AuditIcon;
  tone: AuditTone;
  sentence: Part[];
  /** "Before → after" lines for edits. */
  changes: { label: string; from: string; to: string }[];
  /** Extra facts shown under the sentence. */
  facts: { label: string; value: string; href?: string }[];
};

export type AuditRow = {
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
};

export type StudentRef = { name: string; code: string };
export type AuditLookups = {
  students: Map<string, StudentRef>;
  /** payment id → student id and token code (for rows saved before the token was written into the log). */
  payments: Map<string, { studentId: string; amountPaisa: number; receiptNo: string; tokenCode: string | null }>;
  buildings: Map<string, string>;
  rooms: Map<string, { number: string; buildingId: string }>;
  seats: Map<string, { label: string; roomId: string }>;
  members: Map<string, { name: string; role: string }>;
  accounts: Map<string, string>;
  /** Base paths for links ("/admin"). */
  area: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));

function studentPart(id: unknown, L: AuditLookups, fallbackName?: unknown): Part {
  const s = L.students.get(str(id));
  if (s) return { b: `${s.name} (ID ${s.code})`, href: `${L.area}/students/${str(id)}` };
  return { b: str(fallbackName) || "একজন ছাত্র" };
}

function buildingName(id: unknown, L: AuditLookups, fallback?: unknown) {
  return L.buildings.get(str(id)) ?? (str(fallback) || "একটি বিল্ডিং");
}

function seatText(roomId: unknown, seatId: unknown, buildingId: unknown, L: AuditLookups) {
  const room = L.rooms.get(str(roomId));
  const seat = L.seats.get(str(seatId));
  const b = buildingName(buildingId ?? room?.buildingId, L);
  return `বিল্ডিং ${b} · রুম ${room?.number ?? "?"} · সিট ${seat?.label ?? "?"}`;
}

const tokenFact = (code: unknown, L: AuditLookups) =>
  str(code) ? { label: "টোকেন", value: str(code), href: `${L.area}/tokens/${str(code)}` } : null;

type Fact = AuditView["facts"][number];
type Change = AuditView["changes"][number];
/** Drop the empty entries (written as `cond && {...}`). */
const compact = (xs: unknown[]): Fact[] => xs.filter((x): x is Fact => !!x && typeof x === "object");
const compactChanges = (xs: unknown[]): Change[] => xs.filter((x): x is Change => !!x && typeof x === "object");

/** Before → after for the listed fields that changed. */
function diff(
  before: unknown,
  after: unknown,
  fields: Record<string, { label: string; fmt?: (v: unknown) => string }>,
): AuditView["changes"] {
  const b = obj(before);
  const a = obj(after);
  const out: AuditView["changes"] = [];
  for (const [k, f] of Object.entries(fields)) {
    if (JSON.stringify(b[k] ?? null) === JSON.stringify(a[k] ?? null)) continue;
    const fmt = f.fmt ?? ((v: unknown) => str(v) || "(খালি)");
    out.push({ label: f.label, from: fmt(b[k]), to: fmt(a[k]) });
  }
  return out;
}

const yesNo = (v: unknown) => (v ? "হ্যাঁ" : "না");
const emptyOr = (v: unknown) => str(v) || "(খালি)";
const takaOr = (v: unknown) => (v === null || v === undefined ? "(খালি)" : taka(v));

type FieldSpec = Record<string, { label: string; fmt?: (v: unknown) => string }>;

const STUDENT_FIELDS: FieldSpec = {
  fullName: { label: "নাম" },
  phone: { label: "ফোন" },
  fatherName: { label: "বাবা / অভিভাবকের নাম" },
  guardianPhone: { label: "অভিভাবকের ফোন" },
  permanentAddress: { label: "স্থায়ী ঠিকানা" },
  school: { label: "স্কুল" },
  college: { label: "কলেজ" },
  classYear: { label: "ক্লাস / বর্ষ" },
  group: { label: "গ্রুপ" },
  roll: { label: "রোল" },
  notes: { label: "নোট" },
  batchId: { label: "ব্যাচ", fmt: (v: unknown) => (v ? "বদলানো হয়েছে" : "(নেই)") },
  photoPath: { label: "ছবি", fmt: (v: unknown) => (v ? "আছে" : "নেই") },
};

const BUILDING_FIELDS: FieldSpec = {
  code: { label: "বিল্ডিং নম্বর" },
  name: { label: "নাম" },
  address: { label: "ঠিকানা" },
  landlordName: { label: "বাড়িওয়ালার নাম" },
  landlordPhone: { label: "বাড়িওয়ালার ফোন" },
  landlordRentPaisa: { label: "বাড়িওয়ালার ভাড়া", fmt: takaOr },
  notes: { label: "নোট" },
  isActive: { label: "চালু আছে", fmt: yesNo },
};

const ROOM_FIELDS: FieldSpec = {
  number: { label: "রুম নম্বর" },
  floor: { label: "তলা", fmt: emptyOr },
  defaultRentPaisa: { label: "সাধারণ ভাড়া", fmt: takaOr },
  notes: { label: "নোট" },
  isActive: { label: "চালু আছে", fmt: yesNo },
};

const RATE_FIELDS: FieldSpec = {
  breakfastRatePaisa: { label: "সকালের নাস্তা (প্রতি মিল)", fmt: takaOr },
  lunchRatePaisa: { label: "দুপুরের খাবার (প্রতি মিল)", fmt: takaOr },
  dinnerRatePaisa: { label: "রাতের খাবার (প্রতি মিল)", fmt: takaOr },
  mealDepositPaisa: { label: "মিল ডিপোজিট", fmt: takaOr },
  serviceChargePaisa: { label: "সার্ভিস চার্জ (ভর্তির সময়)", fmt: takaOr },
  advanceMonths: { label: "অ্যাডভান্স (কত মাসের ভাড়া)", fmt: (v: unknown) => `${str(v) || 0} মাস` },
  midMonthRule: {
    label: "মাসের মাঝে ছেড়ে গেলে",
    fmt: (v: unknown) => (v === "full" ? "পুরো মাসের ভাড়া" : v === "prorata" ? "যত দিন ছিল তত দিনের" : emptyOr(v)),
  },
  notes: { label: "নোট" },
};

// ---------------------------------------------------------------------------
// The sentences
// ---------------------------------------------------------------------------

export function describeAudit(row: AuditRow, L: AuditLookups): AuditView {
  const a = obj(row.after);
  const b = obj(row.before);
  const category = categoryOf(row.action);
  const base = { category, changes: [] as AuditView["changes"], facts: [] as AuditView["facts"] };

  switch (row.action) {
    // ---- money -------------------------------------------------------------
    case "payment.create": {
      const p = L.payments.get(str(row.entityId));
      const allocations = Array.isArray(a.allocations) ? (a.allocations as Obj[]) : [];
      const paidFor = allocations
        .map(
          (x) =>
            `${HEAD[str(x.head)] ?? str(x.head)}${x.period ? ` (${bnPeriod(x.period)})` : ""} ${taka(x.amountPaisa)}`,
        )
        .join(", ");
      return {
        ...base,
        icon: "payment",
        tone: "ok",
        sentence: [studentPart(p?.studentId, L), " টাকা দিয়েছে: ", { b: taka(a.amountPaisa ?? p?.amountPaisa) }],
        facts: compact([
          {
            label: "রসিদ",
            value: str(a.receiptNo ?? p?.receiptNo),
            href: row.entityId ? `/receipts/${row.entityId}` : undefined,
          },
          tokenFact(a.token ?? p?.tokenCode, L),
          { label: "কোথায় নেওয়া হয়েছে", value: str(a.account) || "—" },
          str(a.trxId) && { label: "ট্রানজেকশন আইডি", value: str(a.trxId) },
          paidFor && { label: "কোন খাতে গেছে", value: paidFor },
          Number(a.leftoverPaisa) > 0 && {
            label: "বাড়তি টাকা",
            value: `${taka(a.leftoverPaisa)} (পরের টোকেনে "Extra paid" হিসেবে যাবে)`,
          },
        ]),
      };
    }
    case "payment.void": {
      const p = L.payments.get(str(row.entityId));
      return {
        ...base,
        icon: "void",
        tone: "bad",
        sentence: [
          studentPart(b.studentId ?? p?.studentId, L),
          "-এর ",
          { b: taka(b.amountPaisa ?? p?.amountPaisa) },
          " পেমেন্ট বাতিল (void) করা হয়েছে। টাকাটা আবার বাকি হিসেবে ফিরে গেছে।",
        ],
        facts: compact([
          { label: "বাতিলের কারণ", value: str(a.reason) || "—" },
          {
            label: "রসিদ",
            value: str(b.receiptNo ?? p?.receiptNo),
            href: row.entityId ? `/receipts/${row.entityId}` : undefined,
          },
          b.paidDate && { label: "টাকা নেওয়ার তারিখ", value: bnDate(b.paidDate) },
          b.method && { label: "মাধ্যম", value: METHOD[str(b.method)] ?? str(b.method) },
        ]),
      };
    }
    case "refund.create":
      return {
        ...base,
        icon: "refund",
        tone: "warn",
        sentence: [studentPart(a.studentId, L), "-কে ", { b: taka(a.amount) }, " ফেরত দেওয়া হয়েছে"],
        facts: compact([
          { label: "কোথা থেকে দেওয়া হয়েছে", value: str(a.account) || "—" },
          str(a.note) && { label: "নোট", value: str(a.note) },
        ]),
      };
    case "ledger.adjustment": {
      const charge = a.direction === "charge";
      return {
        ...base,
        icon: "adjust",
        tone: "warn",
        sentence: [
          studentPart(a.studentId, L),
          "-এর হিসাবে ",
          { b: taka(a.amount) },
          charge ? " যোগ করা হয়েছে (বাকি বেড়েছে)" : " কমানো / মাফ করা হয়েছে (বাকি কমেছে)",
        ],
        facts: compact([
          { label: "খাত", value: HEAD[str(a.head)] ?? str(a.head) },
          a.period && { label: "মাস", value: bnPeriod(a.period) },
          str(a.description) && { label: "কারণ", value: str(a.description) },
        ]),
      };
    }
    case "payment_account.create":
      return {
        ...base,
        icon: "account",
        tone: "info",
        sentence: ["টাকা নেওয়ার নতুন জায়গা যোগ করা হয়েছে: ", { b: str(a.name) }],
        facts: compact([
          { label: "ধরন", value: METHOD[str(a.method)] ?? str(a.method) },
          str(a.details) && { label: "বিস্তারিত", value: str(a.details) },
        ]),
      };
    case "payment_account.disable":
    case "payment_account.enable":
      return {
        ...base,
        icon: "account",
        tone: row.action.endsWith("disable") ? "warn" : "info",
        sentence: [
          "টাকা নেওয়ার জায়গা ",
          { b: L.accounts.get(str(row.entityId)) ?? "একটি account" },
          row.action.endsWith("disable") ? " বন্ধ করা হয়েছে" : " আবার চালু করা হয়েছে",
        ],
      };

    // ---- tokens ------------------------------------------------------------
    case "billing.token_run":
    case "billing.month_end": {
      const period = str(row.entityId) || "";
      return {
        ...base,
        icon: "token",
        tone: "auto",
        sentence: [
          period ? { b: bnPeriod(period) } : "এই মাস",
          "-এর টোকেন বানানো হয়েছে: ",
          { b: `${Number(a.tokensMade) || 0} জন ছাত্রের` },
        ],
        facts: compact([
          a.closedPeriod && {
            label: "লক করা মাস",
            value: `${bnPeriod(a.closedPeriod)} (এই মাসের মিল ও টাকা আর বদলানো যাবে না)`,
          },
          {
            label: "কীভাবে",
            value: a.byCron ? "রাত 12:05-এ নিজে থেকে (অটো)" : "অ্যাডমিন বোতাম চেপে বানিয়েছেন",
          },
        ]),
        changes: [],
      };
    }
    case "token.early": {
      const meal = obj(a.meal);
      return {
        ...base,
        icon: "token",
        tone: "info",
        sentence: [studentPart(row.entityId, L), "-এর ", { b: bnPeriod(a.period) }, "-এর টোকেন আগাম বানানো হয়েছে"],
        facts: compact([
          tokenFact(a.code, L),
          { label: "টোকেনের মোট", value: taka(a.totalPaisa) },
          meal.from &&
            meal.to && {
              label: "Pre meal",
              value: `${bnDate(meal.from)} – ${bnDate(meal.to)}: ${taka(meal.differencePaisa)}`,
            },
        ]),
      };
    }

    // ---- students ----------------------------------------------------------
    case "student.admit":
    case "student.import":
      return {
        ...base,
        icon: "admit",
        tone: "ok",
        sentence: [
          row.action === "student.import" ? "Excel থেকে নতুন ছাত্র যোগ করা হয়েছে: " : "নতুন ছাত্র ভর্তি করা হয়েছে: ",
          studentPart(row.entityId, L, a.fullName),
        ],
        facts: compact([
          str(a.seat) && { label: "সিট", value: str(a.seat) },
          a.rentPaisa !== undefined && { label: "মাসিক ভাড়া", value: taka(a.rentPaisa) },
          (a.admissionDate || a.startDate) && { label: "ভর্তির তারিখ", value: bnDate(a.admissionDate ?? a.startDate) },
          str(a.phone) && { label: "ফোন", value: str(a.phone) },
        ]),
      };
    case "student.update": {
      const changes = diff(b, a, STUDENT_FIELDS);
      return {
        ...base,
        icon: "student",
        tone: "info",
        sentence: [studentPart(row.entityId, L, a.fullName), "-এর তথ্য বদলানো হয়েছে"],
        changes,
        facts: changes.length ? [] : [{ label: "বদল", value: "কিছু বদলায়নি (একই তথ্য আবার সেভ করা হয়েছে)" }],
      };
    }
    case "student.seat_change":
    case "student.rent_change": {
      const seatChange = row.action === "student.seat_change";
      return {
        ...base,
        icon: "seat",
        tone: "info",
        sentence: [
          studentPart(row.entityId, L),
          seatChange ? "-এর সিট বদলানো হয়েছে" : "-এর মাসিক ভাড়া বদলানো হয়েছে",
        ],
        changes: compactChanges([
          seatChange && {
            label: "সিট",
            from: seatText(b.roomId, b.seatId, b.buildingId, L),
            to: seatText(a.roomId, a.seatId, a.buildingId, L),
          },
          b.rentPaisa !== a.rentPaisa && { label: "মাসিক ভাড়া", from: taka(b.rentPaisa), to: taka(a.rentPaisa) },
        ]),
        facts: compact([a.startDate && { label: "কবে থেকে", value: bnDate(a.startDate) }]),
      };
    }
    case "student.leave": {
      const meal = obj(a.meal);
      const final = Number(a.finalBalancePaisa) || 0;
      return {
        ...base,
        icon: "leave",
        tone: "warn",
        sentence: [studentPart(row.entityId ?? a.studentId, L, a.fullName), " হোস্টেল ছেড়ে গেছে"],
        facts: compact([
          { label: "শেষ দিন", value: bnDate(a.lastDay) },
          meal.costPaisa !== undefined && {
            label: "শেষ মিলের হিসাব",
            value: `${str(meal.range) ? `${str(meal.range)}: ` : ""}খরচ ${taka(meal.costPaisa)} − ডিপোজিট ${taka(meal.depositPaisa)} = ${taka(meal.differencePaisa)}`,
          },
          Number(a.rentBackPaisa) > 0 && {
            label: "না-থাকা দিনের ভাড়া ফেরত",
            value: `${taka(a.rentBackPaisa)} (${str(a.unusedDays)} দিন)`,
          },
          Number(a.advanceHeldPaisa) > 0 && { label: "অ্যাডভান্স ফেরত", value: taka(a.advanceHeldPaisa) },
          {
            label: "শেষ হিসাব",
            value:
              final > 0
                ? `ছাত্রের কাছে এখনো পাওনা ${taka(final)}`
                : final < 0
                  ? `হোস্টেল ছাত্রকে ফেরত দেবে ${taka(-final)}`
                  : "সব হিসাব মিলে গেছে",
          },
        ]),
      };
    }
    case "student.reset_password":
      return {
        ...base,
        icon: "password",
        tone: "neutral",
        sentence: [studentPart(row.entityId, L), "-এর লগইন পাসওয়ার্ড রিসেট করা হয়েছে"],
      };

    // ---- meals -------------------------------------------------------------
    case "meal.save_day": {
      const offs = Array.isArray(a.offs) ? (a.offs as Obj[]) : [];
      const byStudent = new Map<string, string[]>();
      for (const o of offs) {
        const k = str(o.studentId);
        byStudent.set(k, [...(byStudent.get(k) ?? []), SLOT[str(o.slot)] ?? str(o.slot)]);
      }
      const list = [...byStudent.entries()].map(([id, slots]) => {
        const s = L.students.get(id);
        return `${s ? s.name : "একজন ছাত্র"}: ${slots.join(", ")}`;
      });
      return {
        ...base,
        icon: "meal",
        tone: "info",
        sentence: [
          "বিল্ডিং ",
          { b: buildingName(row.entityId, L) },
          "-এর ",
          { b: bnDate(a.date) },
          " তারিখের মিল সেভ করা হয়েছে",
        ],
        facts: [
          {
            label: "সেদিন যাদের মিল বন্ধ",
            value: list.length ? list.join(" · ") : `কারো বন্ধ নেই, সবার (${str(a.students) || 0} জন) মিল চালু`,
          },
        ],
      };
    }
    case "meal.student_on":
    case "meal.student_off": {
      const on = row.action === "meal.student_on";
      const slots = Array.isArray(a.slots) ? (a.slots as unknown[]).map((s) => SLOT[str(s)] ?? str(s)) : [];
      const range = a.from === a.to || !a.to ? bnDate(a.from) : `${bnDate(a.from)} – ${bnDate(a.to)}`;
      return {
        ...base,
        icon: "meal",
        tone: on ? "ok" : "warn",
        sentence: [
          studentPart(row.entityId, L),
          " নিজের ফোন থেকে ",
          { b: range },
          "-এর ",
          { b: slots.join(", ") || "মিল" },
          on ? " চালু করেছে" : " বন্ধ করেছে",
        ],
      };
    }
    case "meal.student_daily_on":
    case "meal.student_daily_off": {
      const on = row.action.endsWith("_on");
      return {
        ...base,
        icon: "meal",
        tone: on ? "ok" : "warn",
        sentence: [
          studentPart(row.entityId, L),
          " প্রতিদিনের ",
          { b: SLOT[str(a.slot)] ?? str(a.slot) },
          on ? " চালু করেছে" : " বন্ধ করেছে",
        ],
        facts: compact([a.from && { label: "কবে থেকে", value: bnDate(a.from) }]),
      };
    }
    case "meal.add_holiday": {
      const slots = Array.isArray(a.slots) ? (a.slots as unknown[]).map((s) => SLOT[str(s)] ?? str(s)).join(", ") : "";
      return {
        ...base,
        icon: "holiday",
        tone: "warn",
        sentence: [
          "মিল ছুটি দেওয়া হয়েছে: ",
          { b: a.from === a.to ? bnDate(a.from) : `${bnDate(a.from)} – ${bnDate(a.to)}` },
        ],
        facts: compact([
          slots && { label: "কোন মিল", value: slots },
          { label: "কোন বিল্ডিং", value: a.buildingId ? buildingName(a.buildingId, L) : "সব বিল্ডিং" },
          str(a.note) && { label: "নোট", value: str(a.note) },
        ]),
      };
    }
    case "meal.delete_holiday":
      return {
        ...base,
        icon: "holiday",
        tone: "neutral",
        sentence: ["মিল ছুটি তুলে দেওয়া হয়েছে: ", { b: bnDate(b.date) }],
        facts: compact([
          b.slot && { label: "কোন মিল", value: SLOT[str(b.slot)] ?? str(b.slot) },
          { label: "কোন বিল্ডিং", value: b.buildingId ? buildingName(b.buildingId, L) : "সব বিল্ডিং" },
        ]),
      };

    // ---- buildings ---------------------------------------------------------
    case "building.create":
      return {
        ...base,
        icon: "building",
        tone: "ok",
        sentence: ["নতুন বিল্ডিং যোগ করা হয়েছে: ", { b: str(a.code) }],
        facts: compact([
          str(a.name) && { label: "নাম", value: str(a.name) },
          str(a.address) && { label: "ঠিকানা", value: str(a.address) },
        ]),
      };
    case "building.update":
      return {
        ...base,
        icon: "building",
        tone: "info",
        sentence: ["বিল্ডিং ", { b: str(a.code || b.code) }, "-এর তথ্য বদলানো হয়েছে"],
        changes: diff(b, a, BUILDING_FIELDS),
      };
    case "room.bulk_create": {
      const rooms = Array.isArray(a.rooms) ? (a.rooms as unknown[]).map(str) : [];
      const seats = Array.isArray(a.seats) ? (a.seats as unknown[]).map(str) : [];
      return {
        ...base,
        icon: "building",
        tone: "ok",
        sentence: [
          "বিল্ডিং ",
          { b: buildingName(row.entityId, L) },
          `-এ ${rooms.length}টা রুম যোগ করা হয়েছে: `,
          { b: rooms.join(", ") },
        ],
        facts: compact([
          seats.length > 0 && { label: "প্রতি রুমে সিট", value: seats.join(", ") },
          a.defaultRentPaisa !== undefined && { label: "সাধারণ ভাড়া", value: takaOr(a.defaultRentPaisa) },
        ]),
      };
    }
    case "room.create":
      return {
        ...base,
        icon: "building",
        tone: "ok",
        sentence: [
          "বিল্ডিং ",
          { b: buildingName(a.buildingId, L) },
          "-এ নতুন রুম যোগ করা হয়েছে: ",
          { b: str(a.number) },
        ],
        facts: compact([
          Array.isArray(a.seats) && { label: "সিট", value: (a.seats as unknown[]).map(str).join(", ") },
          a.defaultRentPaisa !== undefined && { label: "সাধারণ ভাড়া", value: takaOr(a.defaultRentPaisa) },
        ]),
      };
    case "room.update":
      return {
        ...base,
        icon: "building",
        tone: "info",
        sentence: [
          "বিল্ডিং ",
          { b: buildingName(a.buildingId ?? b.buildingId, L) },
          "-এর রুম ",
          { b: str(a.number || b.number) },
          "-এর তথ্য বদলানো হয়েছে",
        ],
        changes: diff(b, a, ROOM_FIELDS),
      };
    case "room.delete":
      return {
        ...base,
        icon: "building",
        tone: "bad",
        sentence: [
          "বিল্ডিং ",
          { b: buildingName(b.buildingId, L) },
          "-এর রুম ",
          { b: str(b.number) },
          " মুছে ফেলা হয়েছে",
        ],
      };
    case "seat.create":
    case "seat.delete": {
      const s = row.action === "seat.create" ? a : b;
      return {
        ...base,
        icon: "seat",
        tone: row.action === "seat.create" ? "ok" : "bad",
        sentence: [
          row.action === "seat.create" ? "নতুন সিট যোগ করা হয়েছে: " : "সিট মুছে ফেলা হয়েছে: ",
          {
            b: seatText(s.roomId, s.id, s.buildingId, {
              ...L,
              seats: new Map([[str(s.id), { label: str(s.label), roomId: str(s.roomId) }]]),
            }),
          },
        ],
      };
    }
    case "seat.reserve":
    case "seat.unreserve": {
      const reserve = row.action === "seat.reserve";
      const s = reserve ? a : b;
      return {
        ...base,
        icon: "seat",
        tone: reserve ? "warn" : "info",
        sentence: [
          {
            b: seatText(s.roomId, s.id, s.buildingId, {
              ...L,
              seats: new Map([[str(s.id), { label: str(s.label), roomId: str(s.roomId) }]]),
            }),
          },
          reserve ? " রিজার্ভ করে রাখা হয়েছে (কাউকে দেওয়া যাবে না)" : "-এর রিজার্ভ তুলে নেওয়া হয়েছে (এখন খালি)",
        ],
        facts: compact([str(a.reservedNote) && { label: "নোট", value: str(a.reservedNote) }]),
      };
    }

    // ---- settings ----------------------------------------------------------
    case "rates.create":
    case "rates.update": {
      const created = row.action === "rates.create";
      return {
        ...base,
        icon: "rates",
        tone: "info",
        sentence: [
          { b: bnPeriod(a.period) },
          created ? " মাস থেকে নতুন রেট সেট করা হয়েছে" : " মাসের রেট বদলানো হয়েছে",
        ],
        changes: created ? [] : diff(b, a, RATE_FIELDS),
        facts: created
          ? Object.entries(RATE_FIELDS)
              .filter(([k]) => a[k] !== undefined && a[k] !== null && a[k] !== "")
              .map(([k, f]) => ({ label: f.label, value: (f.fmt ?? emptyOr)(a[k]) }))
          : [],
      };
    }
    case "settings.meal_cutoff":
      return {
        ...base,
        icon: "settings",
        tone: "info",
        sentence: ["ছাত্ররা নিজে মিল বন্ধ / চালু করার সময়সীমা বদলানো হয়েছে"],
        changes: [{ label: "সময়সীমা", from: hourText(b.mealCutoffHour), to: hourText(a.mealCutoffHour) }],
      };

    // ---- users -------------------------------------------------------------
    case "membership.create":
      return {
        ...base,
        icon: "user",
        tone: "ok",
        sentence: [`নতুন ${ROLE_LABEL[str(a.role)] ?? "ইউজার"} যোগ করা হয়েছে: `, { b: str(a.fullName) }],
        facts: compact([str(a.phone) && { label: "ফোন", value: str(a.phone) }]),
      };
    case "membership.reset_password": {
      const m = L.members.get(str(row.entityId));
      return {
        ...base,
        icon: "password",
        tone: "neutral",
        sentence: [
          { b: m?.name ?? "একজন ইউজার" },
          m ? ` (${ROLE_LABEL[m.role] ?? m.role})` : "",
          "-এর পাসওয়ার্ড রিসেট করা হয়েছে",
        ],
      };
    }
    case "membership.change_own_password":
      return { ...base, icon: "password", tone: "neutral", sentence: ["নিজের লগইন পাসওয়ার্ড বদলেছেন"] };
    case "membership.set_buildings": {
      const m = L.members.get(str(row.entityId));
      const names = (v: unknown) =>
        Array.isArray(v) && v.length
          ? (v as unknown[]).map((id) => buildingName(id, L)).join(", ")
          : "কোনো বিল্ডিং নেই";
      return {
        ...base,
        icon: "user",
        tone: "info",
        sentence: [{ b: m?.name ?? "একজন ক্যাশিয়ার" }, " কোন কোন বিল্ডিং দেখতে পারবে, তা বদলানো হয়েছে"],
        changes: [{ label: "বিল্ডিং", from: names(row.before), to: names(row.after) }],
      };
    }
  }

  // Anything new that has no sentence yet: still readable.
  return {
    ...base,
    icon: "other",
    tone: "neutral",
    sentence: ["একটি পরিবর্তন করা হয়েছে (", { b: row.action.replace(/[._]/g, " ") }, ")"],
  };
}

/** One line of plain text (for the Excel download). */
export function sentenceText(parts: Part[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.b)).join("");
}

/** IDs the describer needs names for. */
export function idsNeeded(rows: AuditRow[]) {
  const students = new Set<string>();
  const payments = new Set<string>();
  const buildings = new Set<string>();
  const rooms = new Set<string>();
  const seats = new Set<string>();
  const members = new Set<string>();
  const accounts = new Set<string>();
  const add = (set: Set<string>, v: unknown) => {
    if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) set.add(v);
  };
  for (const r of rows) {
    const a = obj(r.after);
    const b = obj(r.before);
    if (r.entityType === "student") add(students, r.entityId);
    if (r.entityType === "payment") add(payments, r.entityId);
    if (r.entityType === "building") add(buildings, r.entityId);
    if (r.entityType === "membership") add(members, r.entityId);
    if (r.entityType === "payment_account") add(accounts, r.entityId);
    for (const o of [a, b]) {
      add(students, o.studentId);
      add(buildings, o.buildingId);
      add(rooms, o.roomId);
      add(seats, o.seatId);
    }
    for (const off of Array.isArray(a.offs) ? (a.offs as Obj[]) : []) add(students, off.studentId);
    for (const id of [...(Array.isArray(r.before) ? r.before : []), ...(Array.isArray(r.after) ? r.after : [])])
      add(buildings, id);
  }
  return { students, payments, buildings, rooms, seats, members, accounts };
}
