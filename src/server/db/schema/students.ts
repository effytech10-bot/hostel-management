import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, paisa, timestamps } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { buildings, rooms, seats } from "./property";

/** Admission batch, e.g. "2026". Former students stay listed under their batch forever. */
export const batches = pgTable(
  "batches",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("batches_org_name_uq").on(t.orgId, t.name)],
).enableRLS();

export const studentStatuses = ["active", "left"] as const;
export type StudentStatus = (typeof studentStatuses)[number];
export const studentStatus = pgEnum("student_status", studentStatuses);

/**
 * A student. Never deleted: when they leave, status becomes "left" and all history stays.
 * building_id = current building (or the last one after leaving); used for cashier access and lists.
 */
export const students = pgTable(
  "students",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    studentCode: text("student_code").notNull(),
    fullName: text("full_name").notNull(),
    photoPath: text("photo_path"),
    fatherName: text("father_name"),
    phone: text("phone").notNull(),
    guardianPhone: text("guardian_phone"),
    permanentAddress: text("permanent_address"),
    school: text("school"),
    college: text("college"),
    classYear: text("class_year"),
    group: text("group_name"),
    roll: text("roll"),
    batchId: uuid("batch_id").references(() => batches.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    status: studentStatus("status").notNull().default("active"),
    admissionDate: date("admission_date", { mode: "string" }).notNull(),
    leftDate: date("left_date", { mode: "string" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("students_org_code_uq").on(t.orgId, t.studentCode),
    uniqueIndex("students_membership_uq").on(t.membershipId),
    index("students_org_status_idx").on(t.orgId, t.status),
    index("students_building_idx").on(t.buildingId),
    index("students_batch_idx").on(t.batchId),
    index("students_phone_idx").on(t.orgId, t.phone),
  ],
).enableRLS();

/**
 * Which seat a student has, at what monthly rent, from when to when.
 * end_date NULL = current. A seat change or rent change closes the row and opens a new one,
 * so the full history is kept.
 */
export const seatAssignments = pgTable(
  "seat_assignments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),
    rentPaisa: paisa("rent_paisa").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    endReason: text("end_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("seat_assignments_one_active_per_seat")
      .on(t.seatId)
      .where(sql`${t.endDate} IS NULL`),
    uniqueIndex("seat_assignments_one_active_per_student")
      .on(t.studentId)
      .where(sql`${t.endDate} IS NULL`),
    index("seat_assignments_student_idx").on(t.studentId),
    index("seat_assignments_building_active_idx")
      .on(t.buildingId)
      .where(sql`${t.endDate} IS NULL`),
    check("seat_assignments_rent_non_negative", sql`${t.rentPaisa} >= 0`),
    check("seat_assignments_dates", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
  ],
).enableRLS();

export type Student = typeof students.$inferSelect;
export type SeatAssignment = typeof seatAssignments.$inferSelect;
