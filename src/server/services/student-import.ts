import "server-only";
import ExcelJS from "exceljs";
import { and, eq, isNull } from "drizzle-orm";
import { addMonths, currentPeriod, isValidPeriod, periodStart, previousPeriod, type Period } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { nextCounter } from "@/server/counters";
import { db } from "@/server/db/client";
import { isPgError, PG_UNIQUE_VIOLATION } from "@/server/db/errors";
import { buildings, memberships, rooms, seatAssignments, seats, students } from "@/server/db/schema";
import {
  cleanImportRow,
  IMPORT_COLUMNS,
  isBlankRow,
  mapHeaders,
  openingLines,
  type CleanImportRow,
  type ImportKey,
  type RawImportRow,
} from "@/server/domain/import";
import { defaultStudentPassword } from "@/server/domain/passwords";
import { floorFromRoomNumber, nextSeatLabel } from "@/server/domain/rooms";
import { AppError } from "@/server/errors";
import { supabaseAdmin } from "@/server/supabase/admin";
import { postLedger } from "./ledger";
import { makeAuthEmail } from "./members";
import { assertPeriodOpen } from "./periods";
import { getOrCreateBatch, STUDENT_CODE_START } from "./students";

export const MAX_IMPORT_ROWS = 1000;
export const IMPORT_CHUNK = 10;

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

/** Split CSV text into rows (handles quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export type ParsedSheet = { sheetName: string; rows: { rowNo: number; raw: RawImportRow }[] };

/**
 * Read the first sheet that has our headers (Building, Room, Name, Phone…).
 * The header row may be anywhere in the first 10 rows (old sheets have a title row on top).
 */
export async function readImportFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  let grids: { sheetName: string; rows: string[][] }[];
  if (name.endsWith(".csv")) {
    grids = [{ sheetName: "CSV", rows: parseCsv(await file.text()) }];
  } else if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new AppError("VALIDATION", "Could not read this Excel file. Save it as .xlsx and try again.");
    }
    grids = wb.worksheets.map((ws) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => {
        const values = r.values as ExcelJS.CellValue[]; // 1-based
        rows[n - 1] = values.slice(1).map(cellText);
      });
      return { sheetName: ws.name, rows: Array.from(rows, (r) => r ?? []) };
    });
  } else {
    throw new AppError("VALIDATION", "Upload the Excel file (.xlsx) or a .csv file.");
  }

  let best: { missing: string[]; sheetName: string } | null = null;
  for (const g of grids) {
    for (let h = 0; h < Math.min(10, g.rows.length); h++) {
      const { map, missing } = mapHeaders(g.rows[h] ?? []);
      if (missing.length === 0) {
        const out: ParsedSheet["rows"] = [];
        for (let i = h + 1; i < g.rows.length; i++) {
          const raw: RawImportRow = {};
          for (const [col, key] of map) raw[key as ImportKey] = (g.rows[i] ?? [])[col] ?? "";
          if (!isBlankRow(raw)) out.push({ rowNo: i + 1, raw });
        }
        if (out.length > MAX_IMPORT_ROWS) {
          throw new AppError("VALIDATION", `At most ${MAX_IMPORT_ROWS} students per file.`);
        }
        return { sheetName: g.sheetName, rows: out };
      }
      if (!best || missing.length < best.missing.length) best = { missing, sheetName: g.sheetName };
    }
  }
  throw new AppError(
    "VALIDATION",
    `No sheet has the needed columns. Missing: ${best?.missing.join(", ") ?? "Building, Room, Name, Phone"}. Use the template.`,
  );
}

/** The blank template the office fills in. */
export async function importTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow(IMPORT_COLUMNS.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  IMPORT_COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, c.header.length + 4);
    // Keep phones and room numbers as text so Excel does not drop the leading 0.
    if (["phone", "guardianPhone", "room", "building", "seat"].includes(c.key)) col.numFmt = "@";
    if (c.required) ws.getCell(1, i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
  });
  const help = wb.addWorksheet("How to fill");
  help.addRow(["Column", "Required", "What to write"]).font = { bold: true };
  for (const c of IMPORT_COLUMNS) help.addRow([c.header, c.required ? "Yes" : "", c.help]);
  help.addRow([]);
  help.addRow([
    "Example",
    "",
    "Building 178, Room 201, Seat A, Rafid, 01711000000, 8100, …, Rent due 0, Meal due 350, Advance paid 16200",
  ]);
  help.addRow(["Money", "", "Amounts in taka. Leave empty or 0 when nothing is owed."]);
  help.addRow(["Dues", "", "Write what each student owes up to the day before the software starts."]);
  help.getColumn(1).width = 22;
  help.getColumn(2).width = 10;
  help.getColumn(3).width = 110;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Checking against the database
// ---------------------------------------------------------------------------

export type ImportRowPlan = {
  rowNo: number;
  status: "ready" | "skip" | "error";
  messages: string[];
  /** Cleaned data with the seat decided (sent back to import). */
  data: (CleanImportRow & { seat: string; rentPaisa: Paisa }) | null;
  newBuilding: boolean;
  newRoom: boolean;
  newSeat: boolean;
  openingDuePaisa: Paisa;
  openingCreditPaisa: Paisa;
  raw: { name: string; phone: string; building: string; room: string };
  /** For ready rows: the original cells with the chosen seat filled in. The page sends this back to import. */
  send: RawImportRow | null;
};

export type ImportPlan = {
  startPeriod: Period;
  startDate: string;
  openingPeriod: Period;
  rows: ImportRowPlan[];
  summary: {
    ready: number;
    skip: number;
    error: number;
    newBuildings: string[];
    newRooms: number;
    newSeats: number;
    openingDuePaisa: Paisa;
    openingCreditPaisa: Paisa;
    advanceHeldPaisa: Paisa;
  };
};

export function checkStartPeriod(start: string): { startPeriod: Period; startDate: string; openingPeriod: Period } {
  if (!isValidPeriod(start)) throw new AppError("VALIDATION", "Choose the month the software starts.");
  const now = currentPeriod();
  if (start < now) throw new AppError("VALIDATION", "The start month cannot be in the past.");
  if (start > addMonths(now, 2)) {
    throw new AppError("VALIDATION", "The start month can be this month or one of the next two months.");
  }
  return { startPeriod: start, startDate: periodStart(start), openingPeriod: previousPeriod(start) };
}

const key = (...parts: string[]) => parts.map((p) => p.toLowerCase()).join("|");

/** Decide, for every row, whether it can be imported and where the student sits. Nothing is written. */
export async function planImport(
  actor: SessionUser,
  input: { rowNo: number; raw: RawImportRow }[],
  start: string,
): Promise<ImportPlan> {
  assertRole(actor, "admin");
  const { startPeriod, startDate, openingPeriod } = checkStartPeriod(start);
  await assertPeriodOpen(db(), actor.orgId, openingPeriod);
  const orgId = actor.orgId;

  const [bRows, rRows, sRows, occupied, phones] = await Promise.all([
    db().select({ id: buildings.id, code: buildings.code }).from(buildings).where(eq(buildings.orgId, orgId)),
    db()
      .select({
        id: rooms.id,
        buildingId: rooms.buildingId,
        number: rooms.number,
        defaultRentPaisa: rooms.defaultRentPaisa,
      })
      .from(rooms)
      .where(eq(rooms.orgId, orgId)),
    db()
      .select({
        id: seats.id,
        roomId: seats.roomId,
        label: seats.label,
        isActive: seats.isActive,
        isReserved: seats.isReserved,
      })
      .from(seats)
      .where(eq(seats.orgId, orgId)),
    db()
      .select({ seatId: seatAssignments.seatId })
      .from(seatAssignments)
      .where(and(eq(seatAssignments.orgId, orgId), isNull(seatAssignments.endDate))),
    db().select({ phone: memberships.phone }).from(memberships).where(eq(memberships.orgId, orgId)),
  ]);

  const buildingByCode = new Map(bRows.map((b) => [key(b.code), b]));
  const roomByKey = new Map(rRows.map((r) => [key(r.buildingId, r.number), r]));
  const seatsByRoom = new Map<string, typeof sRows>();
  for (const s of sRows) seatsByRoom.set(s.roomId, [...(seatsByRoom.get(s.roomId) ?? []), s]);
  const occupiedSeats = new Set(occupied.map((o) => o.seatId));
  const existingPhones = new Set(phones.map((p) => p.phone));

  // Seats handed out by earlier rows of this file: "building|room|label".
  const takenInFile = new Set<string>();
  const newLabelsInRoom = new Map<string, string[]>();
  const phonesInFile = new Map<string, number>();
  const newBuildings = new Set<string>();
  const newRooms = new Set<string>();

  const rows: ImportRowPlan[] = input.map((item) => {
    const cleaned = cleanImportRow(item.raw);
    const rawInfo = {
      name: item.raw.name ?? "",
      phone: item.raw.phone ?? "",
      building: item.raw.building ?? "",
      room: item.raw.room ?? "",
    };
    const plan: ImportRowPlan = {
      rowNo: item.rowNo,
      status: "error",
      messages: cleaned.errors,
      data: null,
      newBuilding: false,
      newRoom: false,
      newSeat: false,
      openingDuePaisa: 0,
      openingCreditPaisa: 0,
      raw: rawInfo,
      send: null,
    };
    const r = cleaned.row;
    if (!r) return plan;
    const messages: string[] = [];

    if (existingPhones.has(r.phone)) {
      return { ...plan, status: "skip", messages: [`Phone ${r.phone} is already in the software (skipped)`] };
    }
    const dupRow = phonesInFile.get(r.phone);
    if (dupRow) return { ...plan, messages: [`Same phone as row ${dupRow}`] };
    phonesInFile.set(r.phone, item.rowNo);

    if (r.admissionDate && r.admissionDate > startDate) {
      messages.push(
        `Admission date ${r.admissionDate} is after the start (${startDate}). Admit this student from Students → New later.`,
      );
    }

    const building = buildingByCode.get(key(r.building));
    const roomRow = building ? roomByKey.get(key(building.id, r.room)) : undefined;
    const roomKey = key(r.building, r.room);
    if (!building) newBuildings.add(r.building);
    if (!roomRow) newRooms.add(roomKey);

    const existingSeats = roomRow ? (seatsByRoom.get(roomRow.id) ?? []) : [];
    const newInRoom = newLabelsInRoom.get(roomKey) ?? [];
    let label = r.seat;
    let newSeat = false;
    if (label) {
      const s = existingSeats.find((x) => x.label.toUpperCase() === label);
      if (takenInFile.has(key(roomKey, label))) messages.push(`Seat ${r.room}-${label} is given to another row too`);
      else if (s && occupiedSeats.has(s.id)) messages.push(`Seat ${r.room}-${label} already has a student`);
      else if (s && !s.isActive) messages.push(`Seat ${r.room}-${label} is switched off`);
      newSeat = !s;
    } else {
      const free = existingSeats
        .filter((s) => s.isActive && !s.isReserved && !occupiedSeats.has(s.id))
        .map((s) => s.label)
        .sort()
        .find((l) => !takenInFile.has(key(roomKey, l.toUpperCase())));
      if (free) label = free.toUpperCase();
      else {
        label = nextSeatLabel([...existingSeats.map((s) => s.label), ...newInRoom]);
        newSeat = true;
      }
    }
    takenInFile.add(key(roomKey, label));
    if (newSeat) newLabelsInRoom.set(roomKey, [...newInRoom, label]);

    const rentPaisa = r.rentPaisa ?? roomRow?.defaultRentPaisa ?? null;
    if (rentPaisa === null) messages.push("Monthly rent is missing (and the room has no default rent)");

    // Advance paid is held money, not a due: it is shown separately.
    const due = r.rentDuePaisa + r.mealDuePaisa + r.baburchiDuePaisa + r.otherDuePaisa + r.advanceDuePaisa;
    const credit = r.creditPaisa;

    if (messages.length) return { ...plan, messages };
    return {
      ...plan,
      status: "ready",
      messages: [],
      data: { ...r, seat: label, rentPaisa: rentPaisa! },
      newBuilding: !building,
      newRoom: !roomRow,
      newSeat,
      openingDuePaisa: due,
      openingCreditPaisa: credit,
      send: { ...item.raw, seat: label },
    };
  });

  const ready = rows.filter((r) => r.status === "ready");
  return {
    startPeriod,
    startDate,
    openingPeriod,
    rows,
    summary: {
      ready: ready.length,
      skip: rows.filter((r) => r.status === "skip").length,
      error: rows.filter((r) => r.status === "error").length,
      newBuildings: [...new Set(ready.filter((r) => r.newBuilding).map((r) => r.data!.building))],
      newRooms: new Set(ready.filter((r) => r.newRoom).map((r) => key(r.data!.building, r.data!.room))).size,
      newSeats: ready.filter((r) => r.newSeat).length,
      openingDuePaisa: ready.reduce((s, r) => s + r.openingDuePaisa, 0),
      openingCreditPaisa: ready.reduce((s, r) => s + r.openingCreditPaisa, 0),
      advanceHeldPaisa: ready.reduce((s, r) => s + (r.data?.advancePaidPaisa ?? 0), 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Importing (a few rows per call, so the page can show progress)
// ---------------------------------------------------------------------------

export type ImportRowResult = {
  rowNo: number;
  ok: boolean;
  skipped?: boolean;
  message?: string;
  studentId?: string;
  studentCode?: string;
  name: string;
  phone: string;
  seatText?: string;
};

export async function importStudents(
  actor: SessionUser,
  rows: { rowNo: number; raw: RawImportRow }[],
  start: string,
): Promise<ImportRowResult[]> {
  assertRole(actor, "admin");
  if (rows.length > IMPORT_CHUNK * 5) throw new AppError("VALIDATION", "Too many rows in one go.");
  // Check again on the server: the data came back from the browser, and others may have changed things since.
  const plan = await planImport(actor, rows, start);
  const results: ImportRowResult[] = [];

  for (const p of plan.rows) {
    const base = { rowNo: p.rowNo, name: p.raw.name, phone: p.raw.phone };
    if (p.status !== "ready" || !p.data) {
      results.push({ ...base, ok: false, skipped: p.status === "skip", message: p.messages.join("; ") });
      continue;
    }
    try {
      results.push({ ...base, ok: true, ...(await importOne(actor, p.data, plan)) });
    } catch (e) {
      results.push({ ...base, ok: false, message: e instanceof AppError ? e.message : "Could not save this row." });
      if (!(e instanceof AppError)) console.error(e);
    }
  }
  return results;
}

async function importOne(
  actor: SessionUser,
  d: CleanImportRow & { seat: string; rentPaisa: Paisa },
  plan: Pick<ImportPlan, "startDate" | "openingPeriod" | "startPeriod">,
): Promise<{ studentId: string; studentCode: string; seatText: string }> {
  const orgId = actor.orgId;
  const authEmail = makeAuthEmail();
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: authEmail,
    password: defaultStudentPassword(d.phone),
    email_confirm: true,
    user_metadata: { full_name: d.name },
  });
  if (error || !data.user) throw new AppError("AUTH", `Could not create the login: ${error?.message ?? "unknown"}`);
  const userId = data.user.id;

  try {
    return await db().transaction(async (tx) => {
      // Building, room, seat: use what exists, create what is missing.
      let [building] = await tx
        .select({ id: buildings.id, code: buildings.code })
        .from(buildings)
        .where(eq(buildings.orgId, orgId))
        .then((all) => all.filter((b) => b.code.toLowerCase() === d.building.toLowerCase()));
      if (!building) {
        [building] = await tx
          .insert(buildings)
          .values({ orgId, code: d.building })
          .returning({ id: buildings.id, code: buildings.code });
      }
      let [room] = await tx
        .select({ id: rooms.id, number: rooms.number })
        .from(rooms)
        .where(and(eq(rooms.buildingId, building.id), eq(rooms.number, d.room)));
      if (!room) {
        [room] = await tx
          .insert(rooms)
          .values({
            orgId,
            buildingId: building.id,
            number: d.room,
            floor: floorFromRoomNumber(d.room),
            defaultRentPaisa: d.rentPaisa,
          })
          .returning({ id: rooms.id, number: rooms.number });
      }
      await tx
        .insert(seats)
        .values({ orgId, buildingId: building.id, roomId: room.id, label: d.seat })
        .onConflictDoNothing();
      const [seat] = await tx
        .select({ id: seats.id, label: seats.label, isActive: seats.isActive })
        .from(seats)
        .where(and(eq(seats.roomId, room.id), eq(seats.label, d.seat)))
        .for("update");
      if (!seat?.isActive) throw new AppError("CONFLICT", `Seat ${d.room}-${d.seat} is switched off.`);
      const [taken] = await tx
        .select({ id: seatAssignments.id })
        .from(seatAssignments)
        .where(and(eq(seatAssignments.seatId, seat.id), isNull(seatAssignments.endDate)))
        .limit(1);
      if (taken) throw new AppError("CONFLICT", `Seat ${d.room}-${d.seat} already has a student.`);

      const batchId = await getOrCreateBatch(tx, orgId, d.batch);
      const studentCode = String(await nextCounter(tx, orgId, "student_code", STUDENT_CODE_START));
      const [membership] = await tx
        .insert(memberships)
        .values({
          orgId,
          userId,
          role: "student",
          fullName: d.name,
          phone: d.phone,
          authEmail,
          mustChangePassword: true,
        })
        .returning({ id: memberships.id });
      const [student] = await tx
        .insert(students)
        .values({
          orgId,
          membershipId: membership.id,
          studentCode,
          fullName: d.name,
          fatherName: d.fatherName,
          phone: d.phone,
          guardianPhone: d.guardianPhone,
          permanentAddress: d.address,
          school: d.school,
          college: d.college,
          classYear: d.classYear,
          group: d.group,
          roll: d.roll,
          batchId,
          buildingId: building.id,
          admissionDate: d.admissionDate ?? plan.startDate,
          notes: d.notes,
        })
        .returning({ id: students.id });
      // The seat (and so rent and meals) starts when the software starts; older months are in the opening balance.
      await tx.insert(seatAssignments).values({
        orgId,
        studentId: student.id,
        buildingId: building.id,
        roomId: room.id,
        seatId: seat.id,
        rentPaisa: d.rentPaisa,
        startDate: plan.startDate,
      });
      await tx.update(seats).set({ isReserved: false, reservedNote: null }).where(eq(seats.id, seat.id));

      const openingDate = new Date(`${plan.startDate}T00:00:00Z`);
      openingDate.setUTCDate(openingDate.getUTCDate() - 1);
      await postLedger(
        tx,
        openingLines(d).map((l) => ({
          orgId,
          studentId: student.id,
          buildingId: building.id,
          period: plan.openingPeriod,
          entryDate: openingDate.toISOString().slice(0, 10),
          head: l.head,
          amountPaisa: l.amountPaisa,
          sourceType: l.paid ? ("opening_payment" as const) : ("opening" as const),
          description: l.label,
          createdBy: actor.membershipId,
        })),
      );
      const seatText = `${building.code} · ${room.number}-${seat.label}`;
      await writeAudit(tx, {
        orgId,
        actorMembershipId: actor.membershipId,
        action: "student.import",
        entityType: "student",
        entityId: student.id,
        after: { ...d, studentCode, seat: seatText, startDate: plan.startDate },
      });
      return { studentId: student.id, studentCode, seatText };
    });
  } catch (e) {
    await supabaseAdmin().auth.admin.deleteUser(userId);
    if (isPgError(e, PG_UNIQUE_VIOLATION))
      throw new AppError("CONFLICT", "This seat or phone was just used by someone else.");
    throw e;
  }
}
