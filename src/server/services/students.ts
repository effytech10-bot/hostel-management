import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import type {
  AdmissionInput,
  StudentPasswordInput,
  TransferInput,
  UpdateProfileInput,
} from "@/lib/validation/students";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { nextCounter } from "@/server/counters";
import { db, type Transaction } from "@/server/db/client";
import { isPgError, PG_UNIQUE_VIOLATION } from "@/server/db/errors";
import {
  batches,
  buildings,
  memberships,
  rooms,
  seatAssignments,
  seats,
  students,
  type StudentStatus,
} from "@/server/db/schema";
import { defaultStudentPassword } from "@/server/domain/passwords";
import { compareRoomNumbers } from "@/server/domain/rooms";
import { AppError } from "@/server/errors";
import { signedPhotoUrls, uploadStudentPhoto } from "@/server/storage";
import { supabaseAdmin } from "@/server/supabase/admin";
import { accessibleBuildingIds } from "./buildings";
import { makeAuthEmail } from "./members";
import { assertPeriodOpen } from "./periods";
import { getEffectiveRates } from "./rates";
import { postLedger } from "./ledger";
import { admissionLines } from "@/server/domain/stay";
import { formatPeriod, periodOf } from "@/lib/dates";
import { tokenLines, tokens } from "@/server/db/schema";

export const STUDENT_CODE_START = 10001;
export const STUDENTS_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertStaff(actor: SessionUser) {
  assertRole(actor, "admin", "cashier");
}

async function assertBuildingAccess(actor: SessionUser, buildingId: string | null) {
  const allowed = await accessibleBuildingIds(actor);
  if (allowed === null) return;
  if (!buildingId || !allowed.includes(buildingId)) {
    throw new AppError("FORBIDDEN", "This student is not in one of your buildings.");
  }
}

export async function getOrCreateBatch(tx: Transaction, orgId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const [existing] = await tx
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.orgId, orgId), ilike(batches.name, name)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(batches).values({ orgId, name }).returning({ id: batches.id });
  return created.id;
}

/** Lock a seat and check it can be given to a student right now. */
async function lockFreeSeat(tx: Transaction, actor: SessionUser, seatId: string) {
  const [seat] = await tx
    .select({
      id: seats.id,
      roomId: seats.roomId,
      buildingId: seats.buildingId,
      label: seats.label,
      isActive: seats.isActive,
      roomNumber: rooms.number,
      buildingCode: buildings.code,
    })
    .from(seats)
    .innerJoin(rooms, eq(rooms.id, seats.roomId))
    .innerJoin(buildings, eq(buildings.id, seats.buildingId))
    .where(and(eq(seats.id, seatId), eq(seats.orgId, actor.orgId)))
    .for("update", { of: seats })
    .limit(1);
  if (!seat || !seat.isActive) throw new AppError("NOT_FOUND", "Seat not found.");
  await assertBuildingAccess(actor, seat.buildingId);

  const [taken] = await tx
    .select({ id: seatAssignments.id })
    .from(seatAssignments)
    .where(and(eq(seatAssignments.seatId, seat.id), isNull(seatAssignments.endDate)))
    .limit(1);
  if (taken) throw new AppError("CONFLICT", `Seat ${seat.roomNumber}-${seat.label} is already occupied.`);
  return seat;
}

function mapSeatConflict(error: unknown): never {
  if (isPgError(error, PG_UNIQUE_VIOLATION)) {
    throw new AppError("CONFLICT", "That seat was just taken by someone else. Choose another seat.");
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type StudentFilters = {
  q?: string;
  buildingId?: string;
  status?: StudentStatus | "all";
  batchId?: string;
  page?: number;
};

export type StudentListRow = {
  id: string;
  studentCode: string;
  fullName: string;
  phone: string;
  status: StudentStatus;
  batchName: string | null;
  buildingCode: string | null;
  roomNumber: string | null;
  seatLabel: string | null;
  rentPaisa: number | null;
};

export async function listStudents(
  actor: SessionUser,
  filters: StudentFilters,
): Promise<{ rows: StudentListRow[]; total: number; page: number; pageCount: number }> {
  assertStaff(actor);
  const allowed = await accessibleBuildingIds(actor);
  const page = Math.max(1, filters.page ?? 1);
  if (allowed && allowed.length === 0) return { rows: [], total: 0, page, pageCount: 1 };

  const where: SQL[] = [eq(students.orgId, actor.orgId)];
  const status = filters.status ?? "active";
  if (status !== "all") where.push(eq(students.status, status));
  if (allowed) where.push(inArray(students.buildingId, allowed));
  if (filters.buildingId) where.push(eq(students.buildingId, filters.buildingId));
  if (filters.batchId) where.push(eq(students.batchId, filters.batchId));

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = q.replace(/\D/g, "");
    const matches = [ilike(students.fullName, like), ilike(students.studentCode, like), eq(rooms.number, q)];
    if (digits.length >= 4) matches.push(ilike(students.phone, `%${digits}%`));
    where.push(or(...matches)!);
  }

  const base = () =>
    db()
      .select()
      .from(students)
      .leftJoin(batches, eq(batches.id, students.batchId))
      .leftJoin(seatAssignments, and(eq(seatAssignments.studentId, students.id), isNull(seatAssignments.endDate)))
      .leftJoin(seats, eq(seats.id, seatAssignments.seatId))
      .leftJoin(rooms, eq(rooms.id, seatAssignments.roomId))
      .leftJoin(buildings, eq(buildings.id, students.buildingId))
      .where(and(...where))
      .$dynamic();

  const [rows, [{ total }]] = await Promise.all([
    base()
      .orderBy(asc(buildings.code), asc(rooms.number), asc(seats.label), asc(students.fullName))
      .limit(STUDENTS_PAGE_SIZE)
      .offset((page - 1) * STUDENTS_PAGE_SIZE),
    db()
      .select({ total: count() })
      .from(students)
      .leftJoin(seatAssignments, and(eq(seatAssignments.studentId, students.id), isNull(seatAssignments.endDate)))
      .leftJoin(rooms, eq(rooms.id, seatAssignments.roomId))
      .where(and(...where)),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.students.id,
      studentCode: r.students.studentCode,
      fullName: r.students.fullName,
      phone: r.students.phone,
      status: r.students.status,
      batchName: r.batches?.name ?? null,
      buildingCode: r.buildings?.code ?? null,
      roomNumber: r.rooms?.number ?? null,
      seatLabel: r.seats?.label ?? null,
      rentPaisa: r.seat_assignments?.rentPaisa ?? null,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / STUDENTS_PAGE_SIZE)),
  };
}

export async function listBatches(actor: SessionUser) {
  assertStaff(actor);
  return db()
    .select({ id: batches.id, name: batches.name })
    .from(batches)
    .where(eq(batches.orgId, actor.orgId))
    .orderBy(desc(batches.name));
}

export type AvailableSeat = {
  seatId: string;
  label: string;
  isReserved: boolean;
  reservedNote: string | null;
  roomId: string;
  roomNumber: string;
  defaultRentPaisa: number | null;
  buildingId: string;
  buildingCode: string;
};

/** Seats with nobody in them, in the buildings this user can work with. */
export async function listAvailableSeats(actor: SessionUser): Promise<AvailableSeat[]> {
  assertStaff(actor);
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && allowed.length === 0) return [];

  const where: SQL[] = [
    eq(seats.orgId, actor.orgId),
    eq(seats.isActive, true),
    eq(rooms.isActive, true),
    eq(buildings.isActive, true),
    isNull(seatAssignments.id),
  ];
  if (allowed) where.push(inArray(seats.buildingId, allowed));

  const rows = await db()
    .select({
      seatId: seats.id,
      label: seats.label,
      isReserved: seats.isReserved,
      reservedNote: seats.reservedNote,
      roomId: rooms.id,
      roomNumber: rooms.number,
      defaultRentPaisa: rooms.defaultRentPaisa,
      buildingId: buildings.id,
      buildingCode: buildings.code,
    })
    .from(seats)
    .innerJoin(rooms, eq(rooms.id, seats.roomId))
    .innerJoin(buildings, eq(buildings.id, seats.buildingId))
    .leftJoin(seatAssignments, and(eq(seatAssignments.seatId, seats.id), isNull(seatAssignments.endDate)))
    .where(and(...where));

  return rows.sort(
    (a, b) =>
      compareRoomNumbers(a.buildingCode, b.buildingCode) ||
      compareRoomNumbers(a.roomNumber, b.roomNumber) ||
      a.label.localeCompare(b.label),
  );
}

export async function getStudentDetail(actor: SessionUser, studentId: string) {
  assertStaff(actor);
  const [row] = await db()
    .select()
    .from(students)
    .innerJoin(memberships, eq(memberships.id, students.membershipId))
    .leftJoin(batches, eq(batches.id, students.batchId))
    .where(and(eq(students.id, studentId), eq(students.orgId, actor.orgId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Student not found.");
  await assertBuildingAccess(actor, row.students.buildingId);

  const history = await db()
    .select({
      id: seatAssignments.id,
      seatId: seatAssignments.seatId,
      roomId: seatAssignments.roomId,
      buildingId: seatAssignments.buildingId,
      buildingCode: buildings.code,
      roomNumber: rooms.number,
      seatLabel: seats.label,
      rentPaisa: seatAssignments.rentPaisa,
      startDate: seatAssignments.startDate,
      endDate: seatAssignments.endDate,
      endReason: seatAssignments.endReason,
    })
    .from(seatAssignments)
    .innerJoin(buildings, eq(buildings.id, seatAssignments.buildingId))
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(eq(seatAssignments.studentId, row.students.id))
    .orderBy(desc(seatAssignments.startDate), desc(seatAssignments.createdAt));

  const photos = await signedPhotoUrls([row.students.photoPath]);

  return {
    student: row.students,
    batchName: row.batches?.name ?? null,
    loginActive: row.memberships.isActive,
    current: history.find((h) => h.endDate === null) ?? null,
    history,
    photoUrl: row.students.photoPath ? (photos.get(row.students.photoPath) ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

export type AdmissionResult = {
  studentId: string;
  studentCode: string;
  password: string;
  seatText: string;
  photoWarning?: string;
  /** The first bill, when one was made. */
  firstBill?: { tokenId: string; lines: { label: string; amountPaisa: number }[]; totalPaisa: number };
};

/**
 * Admit a student: login + profile + seat in one go.
 * Money (advance, first month) is added by the billing module; nothing here touches money.
 */
export async function admitStudent(
  actor: SessionUser,
  input: AdmissionInput,
  photo: File | null,
): Promise<AdmissionResult> {
  assertStaff(actor);
  await assertPeriodOpen(db(), actor.orgId, input.admissionDate);

  const [phoneTaken] = await db()
    .select({ fullName: memberships.fullName })
    .from(memberships)
    .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.phone, input.phone)))
    .limit(1);
  if (phoneTaken) {
    throw new AppError("CONFLICT", `Phone ${input.phone} is already used by ${phoneTaken.fullName}.`);
  }

  const password = defaultStudentPassword(input.phone);
  const authEmail = makeAuthEmail();
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user)
    throw new AppError("AUTH", `Could not create the login: ${error?.message ?? "unknown error"}`);
  const userId = data.user.id;

  let result: Omit<AdmissionResult, "password" | "photoWarning">;
  try {
    result = await db().transaction(async (tx) => {
      const seat = await lockFreeSeat(tx, actor, input.seatId);
      const batchId = await getOrCreateBatch(tx, actor.orgId, input.batchName);
      const studentCode = String(await nextCounter(tx, actor.orgId, "student_code", STUDENT_CODE_START));

      const [membership] = await tx
        .insert(memberships)
        .values({
          orgId: actor.orgId,
          userId,
          role: "student",
          fullName: input.fullName,
          phone: input.phone,
          authEmail,
          // First password is the last 6 digits of the phone; the student must replace it at first login.
          mustChangePassword: true,
        })
        .returning({ id: memberships.id });

      const [student] = await tx
        .insert(students)
        .values({
          orgId: actor.orgId,
          membershipId: membership.id,
          studentCode,
          fullName: input.fullName,
          fatherName: input.fatherName,
          phone: input.phone,
          guardianPhone: input.guardianPhone,
          permanentAddress: input.permanentAddress,
          school: input.school,
          college: input.college,
          classYear: input.classYear,
          group: input.group,
          roll: input.roll,
          batchId,
          buildingId: seat.buildingId,
          admissionDate: input.admissionDate,
          notes: input.notes,
        })
        .returning();

      await tx.insert(seatAssignments).values({
        orgId: actor.orgId,
        studentId: student.id,
        buildingId: seat.buildingId,
        roomId: seat.roomId,
        seatId: seat.id,
        rentPaisa: input.rent,
        startDate: input.admissionDate,
      });
      await tx.update(seats).set({ isReserved: false, reservedNote: null }).where(eq(seats.id, seat.id));

      const seatText = `${seat.buildingCode} · Room ${seat.roomNumber} · Seat ${seat.label}`;

      // First bill: advance + this month's rent, meal deposit and baburchi.
      let firstBill: AdmissionResult["firstBill"];
      if (input.firstBill) {
        const period = periodOf(input.admissionDate);
        const effective = await getEffectiveRates(tx, actor.orgId, period);
        if (!effective) {
          throw new AppError(
            "VALIDATION",
            `Set the rates for ${formatPeriod(period)} in Settings first (needed for the first bill).`,
          );
        }
        const { lines } = admissionLines({
          admissionDate: input.admissionDate,
          rentPaisa: input.rent,
          rates: effective.rates,
          rule: effective.rates.midMonthRule,
        });
        const totalPaisa = lines.reduce((s, l) => s + l.amountPaisa, 0);
        const [token] = await tx
          .insert(tokens)
          .values({
            orgId: actor.orgId,
            studentId: student.id,
            buildingId: seat.buildingId,
            period,
            kind: "admission",
            seatText: `${seat.buildingCode} · ${seat.roomNumber}-${seat.label}`,
            rentPaisa: input.rent,
            currentTotalPaisa: totalPaisa,
            previousTotalPaisa: 0,
            totalPaisa,
          })
          .returning({ id: tokens.id });
        await tx.insert(tokenLines).values(
          lines.map((l, i) => ({
            orgId: actor.orgId,
            tokenId: token.id,
            kind: "current" as const,
            head: l.head,
            label: l.label,
            amountPaisa: l.amountPaisa,
            sort: i,
          })),
        );
        await postLedger(
          tx,
          lines.map((l) => ({
            orgId: actor.orgId,
            studentId: student.id,
            buildingId: seat.buildingId,
            period,
            entryDate: input.admissionDate,
            head: l.head,
            amountPaisa: l.amountPaisa,
            sourceType: "admission" as const,
            sourceId: token.id,
            description: l.label,
            createdBy: actor.membershipId,
          })),
        );
        firstBill = {
          tokenId: token.id,
          lines: lines.map((l) => ({ label: l.label, amountPaisa: l.amountPaisa })),
          totalPaisa,
        };
      }
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "student.admit",
        entityType: "student",
        entityId: student.id,
        after: { ...student, seat: seatText, rentPaisa: input.rent },
      });
      return { studentId: student.id, studentCode, seatText, firstBill };
    });
  } catch (err) {
    await supabaseAdmin().auth.admin.deleteUser(userId);
    mapSeatConflict(err);
  }

  let photoWarning: string | undefined;
  if (photo) {
    try {
      const path = await uploadStudentPhoto(actor.orgId, result.studentId, photo);
      await db().update(students).set({ photoPath: path }).where(eq(students.id, result.studentId));
    } catch (e) {
      photoWarning = `Student saved, but the photo was not: ${(e as Error).message}`;
    }
  }

  return { ...result, password, photoWarning };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateStudentProfile(
  actor: SessionUser,
  input: UpdateProfileInput,
  photo: File | null,
): Promise<void> {
  assertStaff(actor);

  await db().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, input.studentId), eq(students.orgId, actor.orgId)))
      .for("update")
      .limit(1);
    if (!before) throw new AppError("NOT_FOUND", "Student not found.");
    await assertBuildingAccess(actor, before.buildingId);

    if (input.phone !== before.phone) {
      const [taken] = await tx
        .select({ fullName: memberships.fullName })
        .from(memberships)
        .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.phone, input.phone)))
        .limit(1);
      if (taken) throw new AppError("CONFLICT", `Phone ${input.phone} is already used by ${taken.fullName}.`);
    }

    const batchId = await getOrCreateBatch(tx, actor.orgId, input.batchName);
    const [after] = await tx
      .update(students)
      .set({
        fullName: input.fullName,
        fatherName: input.fatherName,
        phone: input.phone,
        guardianPhone: input.guardianPhone,
        permanentAddress: input.permanentAddress,
        school: input.school,
        college: input.college,
        classYear: input.classYear,
        group: input.group,
        roll: input.roll,
        batchId,
        notes: input.notes,
      })
      .where(eq(students.id, before.id))
      .returning();

    // The login uses the same name and phone.
    await tx
      .update(memberships)
      .set({ fullName: input.fullName, phone: input.phone })
      .where(eq(memberships.id, before.membershipId));

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "student.update",
      entityType: "student",
      entityId: before.id,
      before,
      after,
    });
  });

  if (photo) {
    const path = await uploadStudentPhoto(actor.orgId, input.studentId, photo);
    await db().update(students).set({ photoPath: path }).where(eq(students.id, input.studentId));
  }
}

// ---------------------------------------------------------------------------
// Seat change / rent change
// ---------------------------------------------------------------------------

/**
 * Move a student to another seat, or change their rent (same seat, new amount).
 * The current assignment is closed on `date` and a new one starts on `date`.
 */
export async function transferSeat(actor: SessionUser, input: TransferInput): Promise<void> {
  assertStaff(actor);
  await assertPeriodOpen(db(), actor.orgId, input.date);
  try {
    await db().transaction(async (tx) => {
      const [student] = await tx
        .select()
        .from(students)
        .where(and(eq(students.id, input.studentId), eq(students.orgId, actor.orgId)))
        .for("update")
        .limit(1);
      if (!student) throw new AppError("NOT_FOUND", "Student not found.");
      if (student.status !== "active") throw new AppError("VALIDATION", "Only active students can change seats.");
      await assertBuildingAccess(actor, student.buildingId);

      const [current] = await tx
        .select()
        .from(seatAssignments)
        .where(and(eq(seatAssignments.studentId, student.id), isNull(seatAssignments.endDate)))
        .for("update")
        .limit(1);
      if (!current) throw new AppError("VALIDATION", "This student has no current seat.");
      if (input.date < current.startDate) {
        throw new AppError("VALIDATION", `The date cannot be before the current seat started (${current.startDate}).`);
      }

      const sameSeat = input.seatId === current.seatId;
      if (sameSeat && input.rent === current.rentPaisa) throw new AppError("VALIDATION", "Nothing changed.");

      await tx
        .update(seatAssignments)
        .set({ endDate: input.date, endReason: sameSeat ? "rent_change" : "seat_change" })
        .where(eq(seatAssignments.id, current.id));

      let target = { id: current.seatId, roomId: current.roomId, buildingId: current.buildingId };
      if (!sameSeat) {
        const seat = await lockFreeSeat(tx, actor, input.seatId);
        target = { id: seat.id, roomId: seat.roomId, buildingId: seat.buildingId };
        await tx.update(seats).set({ isReserved: false, reservedNote: null }).where(eq(seats.id, seat.id));
      }

      const [next] = await tx
        .insert(seatAssignments)
        .values({
          orgId: actor.orgId,
          studentId: student.id,
          buildingId: target.buildingId,
          roomId: target.roomId,
          seatId: target.id,
          rentPaisa: input.rent,
          startDate: input.date,
        })
        .returning();
      await tx.update(students).set({ buildingId: target.buildingId }).where(eq(students.id, student.id));

      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: sameSeat ? "student.rent_change" : "student.seat_change",
        entityType: "student",
        entityId: student.id,
        before: current,
        after: next,
      });
    });
  } catch (err) {
    mapSeatConflict(err);
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Set a temporary password (typed, or the default = last 6 digits of the phone when empty).
 * The student must choose their own password at the next login. Returns the temporary password.
 */
export async function resetStudentPassword(actor: SessionUser, input: StudentPasswordInput): Promise<string> {
  assertStaff(actor);
  const [row] = await db()
    .select({
      id: students.id,
      buildingId: students.buildingId,
      userId: memberships.userId,
      membershipId: memberships.id,
      phone: memberships.phone,
    })
    .from(students)
    .innerJoin(memberships, eq(memberships.id, students.membershipId))
    .where(and(eq(students.id, input.studentId), eq(students.orgId, actor.orgId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Student not found.");
  await assertBuildingAccess(actor, row.buildingId);

  const password = input.password ?? defaultStudentPassword(row.phone);
  const { error } = await supabaseAdmin().auth.admin.updateUserById(row.userId, { password });
  if (error) throw new AppError("AUTH", `Could not reset the password: ${error.message}`);
  await db().update(memberships).set({ mustChangePassword: true }).where(eq(memberships.id, row.membershipId));

  await writeAudit(db(), {
    orgId: actor.orgId,
    actorMembershipId: actor.membershipId,
    action: "student.reset_password",
    entityType: "student",
    entityId: row.id,
  });
  return password;
}
