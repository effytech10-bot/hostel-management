import "server-only";
import { and, asc, eq, gt, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { dhakaDate, periodEnd, periodOf, periodStart, type DateString, type Period } from "@/lib/dates";
import type { HolidayInput, MealDayInput } from "@/lib/validation/meals";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db, type DbOrTx } from "@/server/db/client";
import { isPgError, PG_UNIQUE_VIOLATION } from "@/server/db/errors";
import {
  buildings,
  mealHolidays,
  mealOffs,
  mealPreferences,
  rooms,
  seatAssignments,
  seats,
  students,
} from "@/server/db/schema";
import {
  countMeals,
  defaultOn,
  MEAL_SLOTS,
  mealDateEditError,
  mealKey,
  shiftDate,
  type MealCounts,
  type MealDefault,
  type MealSlot,
  type SeatInterval,
} from "@/server/domain/meals";
import { compareRoomNumbers } from "@/server/domain/rooms";
import { AppError } from "@/server/errors";
import { accessibleBuildingIds } from "./buildings";
import { assertPeriodOpen, isPeriodLocked } from "./periods";

const MAX_HOLIDAY_DAYS = 31;

async function assertBuildingAccess(actor: SessionUser, buildingId: string) {
  assertRole(actor, "admin", "cashier");
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && !allowed.includes(buildingId))
    throw new AppError("FORBIDDEN", "This building is not assigned to you.");
  const [b] = await db()
    .select({ id: buildings.id, code: buildings.code })
    .from(buildings)
    .where(and(eq(buildings.id, buildingId), eq(buildings.orgId, actor.orgId)))
    .limit(1);
  if (!b) throw new AppError("NOT_FOUND", "Building not found.");
  return b;
}

/** Seat assignments in a building that include `date` (start <= date < end). */
function coversDate(date: DateString): SQL {
  return and(
    lte(seatAssignments.startDate, date),
    or(isNull(seatAssignments.endDate), gt(seatAssignments.endDate, date)),
  )!;
}

/** Each student's normal meal settings that started on or before `until` (e.g. breakfast off every day). */
export async function loadMealDefaults(
  tx: DbOrTx,
  studentIds: string[],
  until: DateString,
): Promise<Map<string, MealDefault[]>> {
  const map = new Map<string, MealDefault[]>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({
      studentId: mealPreferences.studentId,
      slot: mealPreferences.slot,
      fromDate: mealPreferences.fromDate,
      isOn: mealPreferences.isOn,
    })
    .from(mealPreferences)
    .where(and(inArray(mealPreferences.studentId, studentIds), lte(mealPreferences.fromDate, until)));
  for (const r of rows) map.set(r.studentId, [...(map.get(r.studentId) ?? []), r]);
  return map;
}

// ---------------------------------------------------------------------------
// Daily grid
// ---------------------------------------------------------------------------

export type MealDayRow = {
  studentId: string;
  studentCode: string;
  fullName: string;
  roomNumber: string;
  seatLabel: string;
  off: MealSlot[];
  /** OFF meals the student turned off from their own phone (that day, or every day). */
  byStudent: MealSlot[];
  /** Meals this student has turned off every day (their normal setting). */
  normallyOff: MealSlot[];
};

export async function getMealDay(actor: SessionUser, buildingId: string, date: DateString) {
  const building = await assertBuildingAccess(actor, buildingId);

  const people = await db()
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      roomNumber: rooms.number,
      seatLabel: seats.label,
      membershipId: students.membershipId,
    })
    .from(seatAssignments)
    .innerJoin(students, eq(students.id, seatAssignments.studentId))
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(and(eq(seatAssignments.orgId, actor.orgId), eq(seatAssignments.buildingId, buildingId), coversDate(date)));

  const ids = people.map((p) => p.studentId);
  const [offRows, defaults, holidayRows] = await Promise.all([
    ids.length
      ? db()
          .select({
            studentId: mealOffs.studentId,
            slot: mealOffs.slot,
            turnedOn: mealOffs.turnedOn,
            createdBy: mealOffs.createdBy,
          })
          .from(mealOffs)
          .where(and(eq(mealOffs.date, date), inArray(mealOffs.studentId, ids)))
      : Promise.resolve([]),
    loadMealDefaults(db(), ids, date),
    db()
      .select({ slot: mealHolidays.slot, note: mealHolidays.note, buildingId: mealHolidays.buildingId })
      .from(mealHolidays)
      .where(
        and(
          eq(mealHolidays.orgId, actor.orgId),
          eq(mealHolidays.date, date),
          or(isNull(mealHolidays.buildingId), eq(mealHolidays.buildingId, buildingId)),
        ),
      ),
  ]);

  const exceptions = new Map(offRows.map((o) => [mealKey(o.studentId, o.slot), o]));

  const rows: MealDayRow[] = people
    .map((p) => {
      const off: MealSlot[] = [];
      const byStudent: MealSlot[] = [];
      const normallyOff: MealSlot[] = [];
      for (const slot of MEAL_SLOTS) {
        const normallyOn = defaultOn(defaults.get(p.studentId), slot, date);
        if (!normallyOn) normallyOff.push(slot);
        const ex = exceptions.get(mealKey(p.studentId, slot));
        const on = ex ? ex.turnedOn : normallyOn;
        if (on) continue;
        off.push(slot);
        if (ex ? ex.createdBy === p.membershipId : true) byStudent.push(slot);
      }
      return {
        studentId: p.studentId,
        studentCode: p.studentCode,
        fullName: p.fullName,
        roomNumber: p.roomNumber,
        seatLabel: p.seatLabel,
        off,
        byStudent,
        normallyOff,
      };
    })
    .sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber) || a.seatLabel.localeCompare(b.seatLabel));

  const holidays: Partial<Record<MealSlot, string>> = {};
  for (const h of holidayRows) holidays[h.slot] = h.note ?? "Holiday";

  return {
    building,
    date,
    rows,
    holidays,
    editError:
      mealDateEditError(date, dhakaDate()) ??
      ((await isPeriodLocked(db(), actor.orgId, periodOf(date)))
        ? "This month is closed. Meals can no longer be changed."
        : null),
  };
}

/**
 * Save the grid: for every student on it, the meals OFF that day become exactly `offs`.
 * Stored as exceptions to each student's normal setting; unchanged cells keep who set them.
 */
export async function saveMealDay(actor: SessionUser, input: MealDayInput): Promise<{ offCount: number }> {
  await assertBuildingAccess(actor, input.buildingId);
  const editError = mealDateEditError(input.date, dhakaDate());
  if (editError) throw new AppError("VALIDATION", editError);
  await assertPeriodOpen(db(), actor.orgId, input.date);

  const studentIds = [...new Set(input.studentIds)];
  if (studentIds.length === 0) return { offCount: 0 };

  return db().transaction(async (tx) => {
    const present = await tx
      .select({ studentId: seatAssignments.studentId })
      .from(seatAssignments)
      .where(
        and(
          eq(seatAssignments.orgId, actor.orgId),
          eq(seatAssignments.buildingId, input.buildingId),
          inArray(seatAssignments.studentId, studentIds),
          coversDate(input.date),
        ),
      );
    const presentSet = new Set(present.map((p) => p.studentId));
    const missing = studentIds.filter((id) => !presentSet.has(id));
    if (missing.length) {
      throw new AppError(
        "CONFLICT",
        "The student list changed (someone moved or joined). Reload the page and try again.",
      );
    }

    const holidayRows = await tx
      .select({ slot: mealHolidays.slot })
      .from(mealHolidays)
      .where(
        and(
          eq(mealHolidays.orgId, actor.orgId),
          eq(mealHolidays.date, input.date),
          or(isNull(mealHolidays.buildingId), eq(mealHolidays.buildingId, input.buildingId)),
        ),
      );
    const holidaySlots = new Set(holidayRows.map((h) => h.slot));

    const offs = new Map<string, { studentId: string; slot: MealSlot }>();
    for (const o of input.offs) {
      if (!presentSet.has(o.studentId) || holidaySlots.has(o.slot)) continue;
      offs.set(mealKey(o.studentId, o.slot), o);
    }

    const [existing, defaults] = await Promise.all([
      tx
        .select({ id: mealOffs.id, studentId: mealOffs.studentId, slot: mealOffs.slot, turnedOn: mealOffs.turnedOn })
        .from(mealOffs)
        .where(and(eq(mealOffs.date, input.date), inArray(mealOffs.studentId, studentIds))),
      loadMealDefaults(tx, studentIds, input.date),
    ]);
    const existingByKey = new Map(existing.map((e) => [mealKey(e.studentId, e.slot), e]));

    const remove: string[] = [];
    const flip: { id: string; turnedOn: boolean }[] = [];
    const add: { studentId: string; slot: MealSlot; turnedOn: boolean }[] = [];
    for (const studentId of studentIds) {
      for (const slot of MEAL_SLOTS) {
        if (holidaySlots.has(slot)) continue;
        const key = mealKey(studentId, slot);
        const wantOn = !offs.has(key);
        const normallyOn = defaultOn(defaults.get(studentId), slot, input.date);
        const ex = existingByKey.get(key);
        if (wantOn === normallyOn) {
          if (ex) remove.push(ex.id);
        } else if (!ex) {
          add.push({ studentId, slot, turnedOn: wantOn });
        } else if (ex.turnedOn !== wantOn) {
          flip.push({ id: ex.id, turnedOn: wantOn });
        }
        // Same exception already stored: keep it, so "by student" stays.
      }
    }

    if (remove.length > 0) await tx.delete(mealOffs).where(inArray(mealOffs.id, remove));
    for (const f of flip) {
      await tx
        .update(mealOffs)
        .set({ turnedOn: f.turnedOn, createdBy: actor.membershipId })
        .where(eq(mealOffs.id, f.id));
    }
    if (add.length > 0) {
      await tx
        .insert(mealOffs)
        .values(
          add.map((o) => ({
            orgId: actor.orgId,
            studentId: o.studentId,
            buildingId: input.buildingId,
            date: input.date,
            slot: o.slot,
            turnedOn: o.turnedOn,
            createdBy: actor.membershipId,
          })),
        )
        .onConflictDoNothing();
    }

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "meal.save_day",
      entityType: "building",
      entityId: input.buildingId,
      after: { date: input.date, students: studentIds.length, offs: [...offs.values()] },
    });
    return { offCount: offs.size };
  });
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export async function listHolidays(actor: SessionUser, from: DateString, to: DateString) {
  assertRole(actor, "admin", "cashier");
  return db()
    .select({
      id: mealHolidays.id,
      date: mealHolidays.date,
      slot: mealHolidays.slot,
      note: mealHolidays.note,
      buildingCode: buildings.code,
    })
    .from(mealHolidays)
    .leftJoin(buildings, eq(buildings.id, mealHolidays.buildingId))
    .where(and(eq(mealHolidays.orgId, actor.orgId), gte(mealHolidays.date, from), lte(mealHolidays.date, to)))
    .orderBy(asc(mealHolidays.date));
}

export async function addHolidays(actor: SessionUser, input: HolidayInput): Promise<number> {
  assertRole(actor, "admin");
  if (input.buildingId) await assertBuildingAccess(actor, input.buildingId);

  const dates: DateString[] = [];
  for (let d = input.from; d <= input.to; d = shiftDate(d, 1)) {
    dates.push(d);
    if (dates.length > MAX_HOLIDAY_DAYS)
      throw new AppError("VALIDATION", `At most ${MAX_HOLIDAY_DAYS} days at a time.`);
  }
  const editError = mealDateEditError(input.from, dhakaDate()) ?? mealDateEditError(input.to, dhakaDate());
  if (editError) throw new AppError("VALIDATION", editError);
  await assertPeriodOpen(db(), actor.orgId, input.from);

  const values = dates.flatMap((date) =>
    input.slots.map((slot) => ({
      orgId: actor.orgId,
      buildingId: input.buildingId,
      date,
      slot,
      note: input.note,
      createdBy: actor.membershipId,
    })),
  );

  try {
    return await db().transaction(async (tx) => {
      const inserted = await tx
        .insert(mealHolidays)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: mealHolidays.id });
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "meal.add_holiday",
        entityType: "meal_holiday",
        entityId: input.buildingId,
        after: { ...input, added: inserted.length },
      });
      return inserted.length;
    });
  } catch (e) {
    if (isPgError(e, PG_UNIQUE_VIOLATION)) throw new AppError("CONFLICT", "Some of these holidays already exist.");
    throw e;
  }
}

export async function deleteHoliday(actor: SessionUser, holidayId: string): Promise<void> {
  assertRole(actor, "admin");
  await db().transaction(async (tx) => {
    const [h] = await tx
      .select()
      .from(mealHolidays)
      .where(and(eq(mealHolidays.id, holidayId), eq(mealHolidays.orgId, actor.orgId)))
      .limit(1);
    if (!h) throw new AppError("NOT_FOUND", "Holiday not found.");
    const editError = mealDateEditError(h.date, dhakaDate());
    if (editError) throw new AppError("VALIDATION", editError);
    await assertPeriodOpen(tx, actor.orgId, h.date);
    await tx.delete(mealHolidays).where(eq(mealHolidays.id, h.id));
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "meal.delete_holiday",
      entityType: "meal_holiday",
      entityId: h.id,
      before: h,
    });
  });
}

// ---------------------------------------------------------------------------
// Monthly counts
// ---------------------------------------------------------------------------

export type MealReportRow = MealCounts & {
  studentId: string;
  studentCode: string;
  fullName: string;
  status: "active" | "left";
  leftDate: string | null;
  /** Building of the latest seat in the month. */
  buildingId: string;
  buildingCode: string;
  seatText: string;
};

/**
 * Meal counts for every student with a seat in `period` (optionally only days in some buildings).
 * No permission checks: callers check access. Used by the report and by month-end settlement.
 */
export async function computeMealCounts(
  tx: DbOrTx,
  orgId: string,
  period: Period,
  buildingIds: string[] | null,
  opts: { studentIds?: string[]; until?: DateString } = {},
): Promise<MealReportRow[]> {
  if (buildingIds && buildingIds.length === 0) return [];
  const start = periodStart(period);
  const end = periodEnd(period);

  const where: SQL[] = [
    eq(seatAssignments.orgId, orgId),
    lte(seatAssignments.startDate, end),
    or(isNull(seatAssignments.endDate), gt(seatAssignments.endDate, start))!,
  ];
  if (buildingIds) where.push(inArray(seatAssignments.buildingId, buildingIds));
  if (opts.studentIds) where.push(inArray(seatAssignments.studentId, opts.studentIds));

  const assignments = await tx
    .select({
      studentId: seatAssignments.studentId,
      buildingId: seatAssignments.buildingId,
      start: seatAssignments.startDate,
      end: seatAssignments.endDate,
      studentCode: students.studentCode,
      fullName: students.fullName,
      status: students.status,
      leftDate: students.leftDate,
      buildingCode: buildings.code,
      roomNumber: rooms.number,
      seatLabel: seats.label,
    })
    .from(seatAssignments)
    .innerJoin(students, eq(students.id, seatAssignments.studentId))
    .innerJoin(buildings, eq(buildings.id, seatAssignments.buildingId))
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(and(...where));

  const studentIds = [...new Set(assignments.map((a) => a.studentId))];
  if (studentIds.length === 0) return [];

  const [offRows, defaults, holidayRows] = await Promise.all([
    tx
      .select({ studentId: mealOffs.studentId, date: mealOffs.date, slot: mealOffs.slot, turnedOn: mealOffs.turnedOn })
      .from(mealOffs)
      .where(and(eq(mealOffs.orgId, orgId), gte(mealOffs.date, start), lte(mealOffs.date, end))),
    loadMealDefaults(tx, studentIds, end),
    tx
      .select({ buildingId: mealHolidays.buildingId, date: mealHolidays.date, slot: mealHolidays.slot })
      .from(mealHolidays)
      .where(and(eq(mealHolidays.orgId, orgId), gte(mealHolidays.date, start), lte(mealHolidays.date, end))),
  ]);

  const offsByStudent = new Map<string, Set<string>>();
  const onsByStudent = new Map<string, Set<string>>();
  for (const o of offRows) {
    const target = o.turnedOn ? onsByStudent : offsByStudent;
    const set = target.get(o.studentId) ?? new Set<string>();
    set.add(mealKey(o.date, o.slot));
    target.set(o.studentId, set);
  }
  const holidaysAll = new Set<string>();
  const holidaysByBuilding = new Map<string, Set<string>>();
  for (const h of holidayRows) {
    if (!h.buildingId) holidaysAll.add(mealKey(h.date, h.slot));
    else {
      const set = holidaysByBuilding.get(h.buildingId) ?? new Set<string>();
      set.add(mealKey(h.date, h.slot));
      holidaysByBuilding.set(h.buildingId, set);
    }
  }

  const byStudent = new Map<string, typeof assignments>();
  for (const a of assignments) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);

  const rows: MealReportRow[] = [...byStudent.values()].map((list) => {
    const latest = [...list].sort((a, b) => b.start.localeCompare(a.start))[0];
    const intervals: SeatInterval[] = list.map((a) => ({ start: a.start, end: a.end, buildingId: a.buildingId }));
    const counts = countMeals({
      period,
      intervals,
      offs: offsByStudent.get(latest.studentId) ?? new Set(),
      ons: onsByStudent.get(latest.studentId),
      defaults: defaults.get(latest.studentId),
      holidaysAll,
      holidaysByBuilding,
      until: opts.until ?? latest.leftDate ?? undefined,
    });
    return {
      ...counts,
      studentId: latest.studentId,
      studentCode: latest.studentCode,
      fullName: latest.fullName,
      status: latest.status,
      leftDate: latest.leftDate,
      buildingId: latest.buildingId,
      buildingCode: latest.buildingCode,
      seatText: `${latest.roomNumber}-${latest.seatLabel}`,
    };
  });

  return rows.sort(
    (a, b) =>
      compareRoomNumbers(a.buildingCode, b.buildingCode) ||
      compareRoomNumbers(a.seatText, b.seatText) ||
      a.fullName.localeCompare(b.fullName),
  );
}

/** Meal counts for a month, limited to the buildings this user can see. */
export async function getMealReport(actor: SessionUser, period: Period, buildingId?: string) {
  assertRole(actor, "admin", "cashier");
  const allowed = await accessibleBuildingIds(actor);
  if (buildingId) await assertBuildingAccess(actor, buildingId);
  const rows = await computeMealCounts(db(), actor.orgId, period, buildingId ? [buildingId] : allowed);

  const totals = rows.reduce(
    (t, r) => ({
      breakfast: t.breakfast + r.breakfast,
      lunch: t.lunch + r.lunch,
      dinner: t.dinner + r.dinner,
      days: t.days + r.days,
      halfUnits: t.halfUnits + r.halfUnits,
    }),
    emptyTotals(),
  );
  return { rows, totals };
}

function emptyTotals(): MealCounts {
  return { breakfast: 0, lunch: 0, dinner: 0, days: 0, halfUnits: 0 };
}
