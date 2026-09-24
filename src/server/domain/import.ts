/**
 * Student import from Excel: column definitions and row cleaning. Pure functions, no database.
 * The database checks (existing buildings, seats, phones) happen in services/student-import.ts.
 */
import { isValidDate, type DateString } from "@/lib/dates";
import { tryParseTaka, type Paisa } from "@/lib/money";
import { normalizeBdPhone } from "@/lib/phone";

export const IMPORT_COLUMNS = [
  {
    key: "building",
    header: "Building",
    required: true,
    aliases: ["building no", "building code", "bldg"],
    help: "Building number/code, e.g. 178 or 177/1. A new building is created if it does not exist.",
  },
  {
    key: "room",
    header: "Room",
    required: true,
    aliases: ["room no", "room number"],
    help: "Room number, e.g. 201. A new room is created if it does not exist.",
  },
  {
    key: "seat",
    header: "Seat",
    required: false,
    aliases: ["seat no", "bed"],
    help: "A, B, C… Leave empty to take the next free seat in the room.",
  },
  { key: "name", header: "Name", required: true, aliases: ["student name", "full name"], help: "Student's name." },
  {
    key: "phone",
    header: "Phone",
    required: true,
    aliases: ["mobile", "phone number", "student phone", "mobile number"],
    help: "Student's own mobile number. It is their login.",
  },
  {
    key: "rent",
    header: "Monthly rent",
    required: false,
    aliases: ["rent", "seat rent"],
    help: "Taka per month. Empty = the room's default rent.",
  },
  {
    key: "admissionDate",
    header: "Admission date",
    required: false,
    aliases: ["admission", "joining date", "join date"],
    help: "When they first joined the hostel (YYYY-MM-DD). Empty = the start date.",
  },
  { key: "fatherName", header: "Father's name", required: false, aliases: ["father", "fathers name"], help: "" },
  {
    key: "guardianPhone",
    header: "Guardian phone",
    required: false,
    aliases: ["guardian", "guardian mobile", "parent phone"],
    help: "",
  },
  { key: "school", header: "School", required: false, aliases: [], help: "" },
  { key: "college", header: "College", required: false, aliases: [], help: "" },
  { key: "classYear", header: "Class / Year", required: false, aliases: ["class", "year", "class year"], help: "" },
  { key: "group", header: "Group", required: false, aliases: [], help: "Science / Commerce / Arts…" },
  { key: "roll", header: "Roll", required: false, aliases: [], help: "" },
  { key: "batch", header: "Batch", required: false, aliases: ["session"], help: "e.g. 2026" },
  { key: "address", header: "Permanent address", required: false, aliases: ["address"], help: "" },
  {
    key: "rentDue",
    header: "Rent due",
    required: false,
    aliases: ["previous rent due", "rent dues"],
    help: "Rent still owed from before the software (taka).",
  },
  {
    key: "mealDue",
    header: "Meal due",
    required: false,
    aliases: ["previous meal due", "meal dues"],
    help: "Meal money still owed from before (taka).",
  },
  {
    key: "baburchiDue",
    header: "Baburchi due",
    required: false,
    aliases: ["baburchi"],
    help: "Baburchi bill still owed (taka).",
  },
  {
    key: "otherDue",
    header: "Other due",
    required: false,
    aliases: ["other", "service charge due"],
    help: "Anything else owed (taka).",
  },
  {
    key: "credit",
    header: "Extra paid (credit)",
    required: false,
    aliases: ["credit", "extra paid", "advance meal"],
    help: "Money the hostel owes the student (paid extra); used for their next bill.",
  },
  {
    key: "advancePaid",
    header: "Advance paid",
    required: false,
    aliases: ["advance", "ad", "advance held"],
    help: "Rent advance the student already paid and the hostel holds (returned when they leave).",
  },
  {
    key: "advanceDue",
    header: "Advance due",
    required: false,
    aliases: [],
    help: "Advance the student still has to pay.",
  },
  { key: "notes", header: "Note", required: false, aliases: ["notes", "remarks", "comment"], help: "" },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type RawImportRow = Partial<Record<ImportKey, string>>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Map spreadsheet headers to our keys. Unknown headers are ignored; returns which required ones are missing. */
export function mapHeaders(headers: readonly string[]): { map: Map<number, ImportKey>; missing: string[] } {
  const lookup = new Map<string, ImportKey>();
  for (const c of IMPORT_COLUMNS) {
    lookup.set(norm(c.header), c.key);
    for (const a of c.aliases) if (!lookup.has(norm(a))) lookup.set(norm(a), c.key);
  }
  const map = new Map<number, ImportKey>();
  const seen = new Set<ImportKey>();
  headers.forEach((h, i) => {
    const key = lookup.get(norm(h ?? ""));
    if (key && !seen.has(key)) {
      map.set(i, key);
      seen.add(key);
    }
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !seen.has(c.key)).map((c) => c.header);
  return { map, missing };
}

export type CleanImportRow = {
  building: string;
  room: string;
  seat: string | null;
  name: string;
  phone: string;
  rentPaisa: Paisa | null;
  admissionDate: DateString | null;
  fatherName: string | null;
  guardianPhone: string | null;
  school: string | null;
  college: string | null;
  classYear: string | null;
  group: string | null;
  roll: string | null;
  batch: string | null;
  address: string | null;
  rentDuePaisa: Paisa;
  mealDuePaisa: Paisa;
  baburchiDuePaisa: Paisa;
  otherDuePaisa: Paisa;
  creditPaisa: Paisa;
  advancePaidPaisa: Paisa;
  advanceDuePaisa: Paisa;
  notes: string | null;
};

/** Excel often stores phone numbers as numbers and drops the leading 0 (1711905813). */
export function cleanPhone(value: string): string | null {
  const v = value.trim().replace(/\.0+$/, "");
  return normalizeBdPhone(/^1[3-9]\d{8}$/.test(v) ? `0${v}` : v);
}

const text = (v: string | undefined, max = 200) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Clean one row. Returns the cleaned row, or the list of problems. */
export function cleanImportRow(raw: RawImportRow): { row: CleanImportRow | null; errors: string[] } {
  const errors: string[] = [];
  const name = text(raw.name, 120);
  if (!name || name.length < 2) errors.push("Name is missing");
  const building = text(raw.building, 40)?.replace(/\\/g, "/") ?? null;
  if (!building) errors.push("Building is missing");
  const room = text(raw.room, 20)?.replace(/\.0+$/, "") ?? null;
  if (!room) errors.push("Room is missing");
  const seat = text(raw.seat, 5)?.toUpperCase() ?? null;

  const phoneText = text(raw.phone, 30);
  const phone = phoneText ? cleanPhone(phoneText) : null;
  if (!phoneText) errors.push("Phone is missing");
  else if (!phone) errors.push(`Phone "${phoneText}" is not a valid Bangladeshi mobile number`);

  const guardianText = text(raw.guardianPhone, 30);
  const guardianPhone = guardianText ? cleanPhone(guardianText) : null;
  if (guardianText && !guardianPhone) errors.push(`Guardian phone "${guardianText}" is not valid`);

  const money = (key: ImportKey, label: string, allowEmpty = true): Paisa | null => {
    const v = text(raw[key], 30);
    if (!v || v === "-") return allowEmpty ? 0 : null;
    const p = tryParseTaka(v);
    if (p === null || p < 0) {
      errors.push(`${label} "${v}" is not a valid amount`);
      return 0;
    }
    return p;
  };
  const rentText = text(raw.rent, 30);
  const rentPaisa = rentText ? money("rent", "Monthly rent") : null;

  const dateText = text(raw.admissionDate, 20);
  let admissionDate: DateString | null = null;
  if (dateText) {
    const iso = dateText.replace(/\//g, "-");
    const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(iso);
    const candidate = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : iso;
    if (isValidDate(candidate)) admissionDate = candidate;
    else errors.push(`Admission date "${dateText}" is not a date (use YYYY-MM-DD)`);
  }

  const row: CleanImportRow = {
    building: building ?? "",
    room: room ?? "",
    seat,
    name: name ?? "",
    phone: phone ?? "",
    rentPaisa,
    admissionDate,
    fatherName: text(raw.fatherName, 120),
    guardianPhone,
    school: text(raw.school),
    college: text(raw.college),
    classYear: text(raw.classYear, 40),
    group: text(raw.group, 40),
    roll: text(raw.roll, 40),
    batch: text(raw.batch, 40),
    address: text(raw.address, 300),
    rentDuePaisa: money("rentDue", "Rent due") ?? 0,
    mealDuePaisa: money("mealDue", "Meal due") ?? 0,
    baburchiDuePaisa: money("baburchiDue", "Baburchi due") ?? 0,
    otherDuePaisa: money("otherDue", "Other due") ?? 0,
    creditPaisa: money("credit", "Extra paid") ?? 0,
    advancePaidPaisa: money("advancePaid", "Advance paid") ?? 0,
    advanceDuePaisa: money("advanceDue", "Advance due") ?? 0,
    notes: text(raw.notes, 300),
  };
  return errors.length ? { row: null, errors } : { row, errors };
}

/** True when every cell of a spreadsheet row is empty (skipped silently). */
export function isBlankRow(raw: RawImportRow): boolean {
  return Object.values(raw).every((v) => !v || !v.trim());
}

export type OpeningLine = {
  head: "rent" | "meal" | "baburchi" | "other" | "credit" | "advance";
  amountPaisa: Paisa;
  paid: boolean;
  label: string;
};

/**
 * Ledger lines for what was owed before the software. Positive = the student owes.
 * Advance paid = a charge AND a payment of the same amount, so the hostel is seen holding it.
 */
export function openingLines(r: CleanImportRow): OpeningLine[] {
  const lines: OpeningLine[] = [
    { head: "rent", amountPaisa: r.rentDuePaisa, paid: false, label: "Rent due before the software" },
    { head: "meal", amountPaisa: r.mealDuePaisa, paid: false, label: "Meal due before the software" },
    { head: "baburchi", amountPaisa: r.baburchiDuePaisa, paid: false, label: "Baburchi due before the software" },
    { head: "other", amountPaisa: r.otherDuePaisa, paid: false, label: "Other due before the software" },
    { head: "credit", amountPaisa: -r.creditPaisa, paid: false, label: "Extra paid before the software" },
    {
      head: "advance",
      amountPaisa: r.advancePaidPaisa + r.advanceDuePaisa,
      paid: false,
      label: "Advance (before the software)",
    },
    { head: "advance", amountPaisa: -r.advancePaidPaisa, paid: true, label: "Advance paid before the software" },
  ];
  return lines.filter((l) => l.amountPaisa !== 0);
}
