import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { dhakaDate, datesInPeriod, periodEnd, periodOf, periodStart, type DateString, type Period } from "@/lib/dates";
import type { MyMealsInput } from "@/lib/validation/meals";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  batches,
  buildings,
  mealHolidays,
  mealOffs,
  mealSettlements,
  paymentAccounts,
  rooms,
  seatAssignments,
  seats,
  students,
} from "@/server/db/schema";
import { mealCost } from "@/server/domain/billing";
import {
  buildingOnDate,
  countMeals,
  firstStudentMealDate,
  formatHour,
  MEAL_SLOTS,
  mealDateEditError,
  mealKey,
  shiftDate,
  type MealSlot,
  type SeatInterval,
} from "@/server/domain/meals";
import { AppError } from "@/server/errors";
import { signedPhotoUrls } from "@/server/storage";
import { getMealCutoffHour } from "./org-settings";
import { assertPeriodOpen, isPeriodLocked } from "./periods";
import { getEffectiveRates } from "./rates";

/**
 * The student's own screens. Every function here finds the student from the LOGIN (membership),
 * never from an id in the URL, so a student can only ever see their own data.
 */

async function myStudentRow(actor: SessionUser) {
  assertRole(actor, "student");
  const [row] = await db()
    .select()
    .from(students)
    .leftJoin(batches, eq(batches.id, students.batchId))
    .where(and(eq(students.membershipId, actor.membershipId), eq(students.orgId, actor.orgId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Your student profile was not found. Please contact the hostel office.");
  return row;
}

export async function getMyStudent(actor: SessionUser) {
  const row = await myStudentRow(actor);
  const s = row.students;
  const [current] = await db()
    .select({
      buildingCode: buildings.code,
      buildingName: buildings.name,
      roomNumber: rooms.number,
      seatLabel: seats.label,
      rentPaisa: seatAssignments.rentPaisa,
      startDate: seatAssignments.startDate,
    })
    .from(seatAssignments)
    .innerJoin(buildings, eq(buildings.id, seatAssignments.buildingId))
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(and(eq(seatAssignments.studentId, s.id), isNull(seatAssignments.endDate)))
    .limit(1);
  const photos = await signedPhotoUrls([s.photoPath]);
  return {
    id: s.id,
    studentCode: s.studentCode,
    fullName: s.fullName,
    fatherName: s.fatherName,
    phone: s.phone,
    guardianPhone: s.guardianPhone,
    permanentAddress: s.permanentAddress,
    school: s.school,
    college: s.college,
    classYear: s.classYear,
    group: s.group,
    roll: s.roll,
    status: s.status,
    admissionDate: s.admissionDate,
    leftDate: s.leftDate,
    batchName: row.batches?.name ?? null,
    current: current ?? null,
    photoUrl: s.photoPath ? (photos.get(s.photoPath) ?? null) : null,
  };
}

export type MyStudent = Awaited<ReturnType<typeof getMyStudent>>;

/** When this student can change their own meals right now. */
export type MyMealRules = {
  /** null = only the office changes meals. */
  cutoffHour: number | null;
  cutoffText: string | null;
  firstEditable: DateString | null;
  lastEditable: DateString | null;
};

function mealRules(cutoffHour: number | null, active: boolean, now = new Date()): MyMealRules {
  const today = dhakaDate(now);
  if (cutoffHour === null || !active) {
    return { cutoffHour, cutoffText: null, firstEditable: null, lastEditable: null };
  }
  return {
    cutoffHour,
    cutoffText: formatHour(cutoffHour),
    firstEditable: firstStudentMealDate(now, cutoffHour, today),
    lastEditable: shiftDate(today, 31),
  };
}

/** Where students can send money (bKash, Nagad, bank). Cash is paid at the office, so it is not listed. */
export async function listPayToAccounts(actor: SessionUser) {
  assertRole(actor, "student");
  return db()
    .select({
      id: paymentAccounts.id,
      name: paymentAccounts.name,
      method: paymentAccounts.method,
      details: paymentAccounts.details,
    })
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.orgId, actor.orgId), eq(paymentAccounts.isActive, true)))
    .orderBy(asc(paymentAccounts.method), asc(paymentAccounts.name))
    .then((rows) => rows.filter((r) => r.method !== "cash"));
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

/** "off" = the student turned it off; "office_off" = the office did (only the office can turn it back on). */
export type MealDayState = "on" | "off" | "office_off" | "holiday";
export type MyMealDay = {
  date: DateString;
  /** false = no seat that day (before joining / after leaving). */
  inHostel: boolean;
  future: boolean;
  /** The student can still change this day's meals themselves. */
  editable: boolean;
  slots: Record<MealSlot, MealDayState>;
  holidayNote: string | null;
};

export async function getMyMealMonth(actor: SessionUser, period: Period) {
  const row = await myStudentRow(actor);
  const s = row.students;
  const start = periodStart(period);
  const end = periodEnd(period);
  const today = dhakaDate();

  const [assignments, offRows, holidayRows, settlementRows, ratesInfo] = await Promise.all([
    db()
      .select({
        start: seatAssignments.startDate,
        end: seatAssignments.endDate,
        buildingId: seatAssignments.buildingId,
      })
      .from(seatAssignments)
      .where(
        and(
          eq(seatAssignments.studentId, s.id),
          lte(seatAssignments.startDate, end),
          or(isNull(seatAssignments.endDate), gt(seatAssignments.endDate, start)),
        ),
      ),
    db()
      .select({ date: mealOffs.date, slot: mealOffs.slot, createdBy: mealOffs.createdBy })
      .from(mealOffs)
      .where(and(eq(mealOffs.studentId, s.id), gte(mealOffs.date, start), lte(mealOffs.date, end))),
    db()
      .select({
        buildingId: mealHolidays.buildingId,
        date: mealHolidays.date,
        slot: mealHolidays.slot,
        note: mealHolidays.note,
      })
      .from(mealHolidays)
      .where(and(eq(mealHolidays.orgId, actor.orgId), gte(mealHolidays.date, start), lte(mealHolidays.date, end))),
    db()
      .select()
      .from(mealSettlements)
      .where(and(eq(mealSettlements.studentId, s.id), eq(mealSettlements.period, period)))
      .limit(1),
    getEffectiveRates(db(), actor.orgId, period),
  ]);
  const [cutoffHour, locked] = await Promise.all([
    getMealCutoffHour(db(), actor.orgId),
    isPeriodLocked(db(), actor.orgId, period),
  ]);
  const rules = mealRules(cutoffHour, s.status === "active");
  const officeOffs = new Set(
    offRows.filter((o) => o.createdBy !== actor.membershipId).map((o) => mealKey(o.date, o.slot)),
  );

  const intervals: SeatInterval[] = assignments;
  const offs = new Set(offRows.map((o) => mealKey(o.date, o.slot)));
  const holidaysAll = new Set<string>();
  const holidaysByBuilding = new Map<string, Set<string>>();
  const holidayNotes = new Map<string, string>();
  for (const h of holidayRows) {
    const key = mealKey(h.date, h.slot);
    if (h.note) holidayNotes.set(`${h.buildingId ?? "*"}|${h.date}`, h.note);
    if (!h.buildingId) holidaysAll.add(key);
    else {
      const set = holidaysByBuilding.get(h.buildingId) ?? new Set<string>();
      set.add(key);
      holidaysByBuilding.set(h.buildingId, set);
    }
  }

  const lastDay = s.leftDate ?? undefined;
  const days: MyMealDay[] = datesInPeriod(period).map((date) => {
    const buildingId = buildingOnDate(intervals, date);
    const inHostel = !!buildingId && (!lastDay || date <= lastDay);
    const slots = {} as Record<MealSlot, MealDayState>;
    for (const slot of MEAL_SLOTS) {
      const key = mealKey(date, slot);
      slots[slot] =
        holidaysAll.has(key) || (buildingId && holidaysByBuilding.get(buildingId)?.has(key))
          ? "holiday"
          : officeOffs.has(key)
            ? "office_off"
            : offs.has(key)
              ? "off"
              : "on";
    }
    return {
      date,
      inHostel,
      future: date > today,
      editable:
        inHostel &&
        !locked &&
        !!rules.firstEditable &&
        date >= rules.firstEditable &&
        date <= (rules.lastEditable ?? ""),
      slots,
      holidayNote: holidayNotes.get(`${buildingId}|${date}`) ?? holidayNotes.get(`*|${date}`) ?? null,
    };
  });

  const base = { period, intervals, offs, holidaysAll, holidaysByBuilding };
  const soFarUntil = lastDay && lastDay < today ? lastDay : today;
  const soFar = countMeals({ ...base, until: soFarUntil });
  const wholeMonth = countMeals({ ...base, until: lastDay });
  const rates = ratesInfo?.rates ?? null;

  const settlement = settlementRows[0] ?? null;
  return {
    period,
    days,
    soFar,
    wholeMonth,
    rates: rates
      ? {
          breakfastRatePaisa: rates.breakfastRatePaisa,
          lunchRatePaisa: rates.lunchRatePaisa,
          dinnerRatePaisa: rates.dinnerRatePaisa,
        }
      : null,
    soFarCostPaisa: rates ? mealCost(soFar, rates) : null,
    wholeMonthCostPaisa: rates ? mealCost(wholeMonth, rates) : null,
    settlement: settlement
      ? {
          breakfast: settlement.breakfast,
          lunch: settlement.lunch,
          dinner: settlement.dinner,
          costPaisa: settlement.costPaisa,
          depositPaisa: settlement.depositPaisa,
          differencePaisa: settlement.differencePaisa,
        }
      : null,
    admissionDate: s.admissionDate,
    rules,
  };
}

/**
 * A student turns their own meals OFF or back ON, for one day or a range (e.g. going home).
 * Allowed only before the deadline (the night before, at the hour the admin chose).
 * Turning ON only undoes the student's own OFFs: meals the office turned off stay off.
 */
export async function setMyMeals(
  actor: SessionUser,
  input: MyMealsInput,
  now = new Date(),
): Promise<{ changed: number; officeKept: number }> {
  const row = await myStudentRow(actor);
  const s = row.students;
  if (s.status !== "active") throw new AppError("VALIDATION", "You have left the hostel.");
  const cutoffHour = await getMealCutoffHour(db(), actor.orgId);
  const rules = mealRules(cutoffHour, true, now);
  if (!rules.firstEditable || !rules.cutoffText) {
    throw new AppError("FORBIDDEN", "Meals are changed by the hostel office. Please tell the office.");
  }
  if (input.from < rules.firstEditable) {
    throw new AppError(
      "VALIDATION",
      `Too late. A day's meals can be changed until ${rules.cutoffText} the night before. The first day you can change now is ${rules.firstEditable}.`,
    );
  }
  const rangeError = mealDateEditError(input.to, dhakaDate(now));
  if (rangeError) throw new AppError("VALIDATION", rangeError);

  const dates: DateString[] = [];
  for (let d = input.from; d <= input.to; d = shiftDate(d, 1)) dates.push(d);
  const slots = [...new Set(input.slots)];

  return db().transaction(async (tx) => {
    for (const period of new Set(dates.map(periodOf))) await assertPeriodOpen(tx, actor.orgId, period);

    const [intervals, holidayRows] = await Promise.all([
      tx
        .select({
          start: seatAssignments.startDate,
          end: seatAssignments.endDate,
          buildingId: seatAssignments.buildingId,
        })
        .from(seatAssignments)
        .where(
          and(
            eq(seatAssignments.studentId, s.id),
            lte(seatAssignments.startDate, input.to),
            or(isNull(seatAssignments.endDate), gt(seatAssignments.endDate, input.from)),
          ),
        ),
      tx
        .select({ buildingId: mealHolidays.buildingId, date: mealHolidays.date, slot: mealHolidays.slot })
        .from(mealHolidays)
        .where(
          and(
            eq(mealHolidays.orgId, actor.orgId),
            gte(mealHolidays.date, input.from),
            lte(mealHolidays.date, input.to),
          ),
        ),
    ]);
    const isHoliday = (date: DateString, slot: MealSlot, buildingId: string) =>
      holidayRows.some(
        (h) => h.date === date && h.slot === slot && (h.buildingId === null || h.buildingId === buildingId),
      );

    const targets = dates.flatMap((date) => {
      const buildingId = buildingOnDate(intervals, date);
      if (!buildingId) return [];
      return slots.filter((slot) => !isHoliday(date, slot, buildingId)).map((slot) => ({ date, slot, buildingId }));
    });
    if (targets.length === 0) throw new AppError("VALIDATION", "No meals to change on these days.");
    const targetDates = [...new Set(targets.map((t) => t.date))];

    let changed: number;
    if (!input.on) {
      const inserted = await tx
        .insert(mealOffs)
        .values(
          targets.map((t) => ({
            orgId: actor.orgId,
            studentId: s.id,
            buildingId: t.buildingId,
            date: t.date,
            slot: t.slot,
            createdBy: actor.membershipId,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: mealOffs.id });
      changed = inserted.length;
    } else {
      const deleted = await tx
        .delete(mealOffs)
        .where(
          and(
            eq(mealOffs.studentId, s.id),
            eq(mealOffs.createdBy, actor.membershipId),
            inArray(mealOffs.date, targetDates),
            inArray(mealOffs.slot, slots),
          ),
        )
        .returning({ id: mealOffs.id });
      changed = deleted.length;
    }
    const stillOff = input.on
      ? await tx
          .select({ id: mealOffs.id })
          .from(mealOffs)
          .where(and(eq(mealOffs.studentId, s.id), inArray(mealOffs.date, targetDates), inArray(mealOffs.slot, slots)))
      : [];

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: input.on ? "meal.student_on" : "meal.student_off",
      entityType: "student",
      entityId: s.id,
      after: { ...input, changed },
    });
    return { changed, officeKept: stillOff.length };
  });
}

export async function listMySettlements(actor: SessionUser) {
  const row = await myStudentRow(actor);
  return db()
    .select({
      period: mealSettlements.period,
      breakfast: mealSettlements.breakfast,
      lunch: mealSettlements.lunch,
      dinner: mealSettlements.dinner,
      costPaisa: mealSettlements.costPaisa,
      depositPaisa: mealSettlements.depositPaisa,
      differencePaisa: mealSettlements.differencePaisa,
    })
    .from(mealSettlements)
    .where(eq(mealSettlements.studentId, row.students.id))
    .orderBy(desc(mealSettlements.period))
    .limit(12);
}
