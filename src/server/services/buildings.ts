import "server-only";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  AddSeatInput,
  BulkRoomsInput,
  CashierBuildingsInput,
  CreateBuildingInput,
  CreateRoomInput,
  ReserveSeatInput,
  UpdateBuildingInput,
  UpdateRoomInput,
} from "@/lib/validation/buildings";
import { writeAudit } from "@/server/audit";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db, type DbOrTx } from "@/server/db/client";
import { isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "@/server/db/errors";
import {
  buildings,
  memberships,
  membershipBuildings,
  rooms,
  seatAssignments,
  seats,
  students,
} from "@/server/db/schema";
import {
  compareRoomNumbers,
  expandRoomRange,
  floorFromRoomNumber,
  nextSeatLabel,
  parseSeatLabels,
} from "@/server/domain/rooms";
import { AppError } from "@/server/errors";

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

/**
 * Buildings this user may work with. null = every building in the organization (admin).
 * Every building-level query for cashiers must filter by this list.
 */
export async function accessibleBuildingIds(actor: SessionUser): Promise<string[] | null> {
  if (actor.role === "admin") return null;
  const rows = await db()
    .select({ buildingId: membershipBuildings.buildingId })
    .from(membershipBuildings)
    .where(and(eq(membershipBuildings.orgId, actor.orgId), eq(membershipBuildings.membershipId, actor.membershipId)));
  return rows.map((r) => r.buildingId);
}

async function loadBuilding(tx: DbOrTx, actor: SessionUser, buildingId: string) {
  const [building] = await tx
    .select()
    .from(buildings)
    .where(and(eq(buildings.id, buildingId), eq(buildings.orgId, actor.orgId)))
    .limit(1);
  if (!building) throw new AppError("NOT_FOUND", "Building not found.");
  return building;
}

async function loadRoom(tx: DbOrTx, actor: SessionUser, roomId: string) {
  const [room] = await tx
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.orgId, actor.orgId)))
    .limit(1);
  if (!room) throw new AppError("NOT_FOUND", "Room not found.");
  return room;
}

async function loadSeat(tx: DbOrTx, actor: SessionUser, seatId: string) {
  const [seat] = await tx
    .select()
    .from(seats)
    .where(and(eq(seats.id, seatId), eq(seats.orgId, actor.orgId)))
    .limit(1);
  if (!seat) throw new AppError("NOT_FOUND", "Seat not found.");
  return seat;
}

function toAppError(error: unknown, messages: { unique?: string; inUse?: string }): never {
  if (messages.unique && isPgError(error, PG_UNIQUE_VIOLATION)) throw new AppError("CONFLICT", messages.unique);
  if (messages.inUse && isPgError(error, PG_FOREIGN_KEY_VIOLATION)) throw new AppError("CONFLICT", messages.inUse);
  throw error;
}

function parseSeatsOrThrow(input: string): string[] {
  try {
    return parseSeatLabels(input);
  } catch (e) {
    throw new AppError("VALIDATION", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type BuildingSummary = {
  id: string;
  code: string;
  name: string | null;
  address: string | null;
  isActive: boolean;
  rooms: number;
  seats: number;
  reserved: number;
  occupied: number;
};

export async function listBuildings(actor: SessionUser): Promise<BuildingSummary[]> {
  const allowed = await accessibleBuildingIds(actor);
  if (allowed && allowed.length === 0) return [];

  const scope = allowed
    ? and(eq(buildings.orgId, actor.orgId), inArray(buildings.id, allowed))
    : eq(buildings.orgId, actor.orgId);

  const [list, roomCounts, seatCounts, occupiedCounts] = await Promise.all([
    db().select().from(buildings).where(scope),
    db()
      .select({ buildingId: rooms.buildingId, total: count() })
      .from(rooms)
      .where(and(eq(rooms.orgId, actor.orgId), eq(rooms.isActive, true)))
      .groupBy(rooms.buildingId),
    db()
      .select({
        buildingId: seats.buildingId,
        total: count(),
        reserved: sql<number>`count(*) filter (where ${seats.isReserved})`.mapWith(Number),
      })
      .from(seats)
      .where(and(eq(seats.orgId, actor.orgId), eq(seats.isActive, true)))
      .groupBy(seats.buildingId),
    db()
      .select({ buildingId: seatAssignments.buildingId, total: count() })
      .from(seatAssignments)
      .where(and(eq(seatAssignments.orgId, actor.orgId), isNull(seatAssignments.endDate)))
      .groupBy(seatAssignments.buildingId),
  ]);

  const roomMap = new Map(roomCounts.map((r) => [r.buildingId, r.total]));
  const seatMap = new Map(seatCounts.map((s) => [s.buildingId, s]));
  const occupiedMap = new Map(occupiedCounts.map((o) => [o.buildingId, o.total]));

  return list
    .map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      address: b.address,
      isActive: b.isActive,
      rooms: roomMap.get(b.id) ?? 0,
      seats: seatMap.get(b.id)?.total ?? 0,
      reserved: seatMap.get(b.id)?.reserved ?? 0,
      occupied: occupiedMap.get(b.id) ?? 0,
    }))
    .sort((a, b) => compareRoomNumbers(a.code, b.code));
}

export type RoomWithSeats = {
  id: string;
  number: string;
  floor: number | null;
  defaultRentPaisa: number | null;
  notes: string | null;
  seats: {
    id: string;
    label: string;
    isReserved: boolean;
    reservedNote: string | null;
    occupant: { studentId: string; name: string; code: string } | null;
  }[];
};

export async function getBuildingDetail(actor: SessionUser, buildingId: string) {
  assertRole(actor, "admin");
  const building = await loadBuilding(db(), actor, buildingId);

  const [roomRows, seatRows, occupants] = await Promise.all([
    db()
      .select()
      .from(rooms)
      .where(and(eq(rooms.buildingId, building.id), eq(rooms.orgId, actor.orgId), eq(rooms.isActive, true))),
    db()
      .select()
      .from(seats)
      .where(and(eq(seats.buildingId, building.id), eq(seats.orgId, actor.orgId), eq(seats.isActive, true)))
      .orderBy(asc(seats.label)),
    db()
      .select({
        seatId: seatAssignments.seatId,
        studentId: students.id,
        name: students.fullName,
        code: students.studentCode,
      })
      .from(seatAssignments)
      .innerJoin(students, eq(students.id, seatAssignments.studentId))
      .where(and(eq(seatAssignments.buildingId, building.id), isNull(seatAssignments.endDate))),
  ]);
  const occupantBySeat = new Map(
    occupants.map((o) => [o.seatId, { studentId: o.studentId, name: o.name, code: o.code }]),
  );

  const seatsByRoom = new Map<string, RoomWithSeats["seats"]>();
  for (const s of seatRows) {
    const list = seatsByRoom.get(s.roomId) ?? [];
    list.push({
      id: s.id,
      label: s.label,
      isReserved: s.isReserved,
      reservedNote: s.reservedNote,
      occupant: occupantBySeat.get(s.id) ?? null,
    });
    seatsByRoom.set(s.roomId, list);
  }

  const roomList: RoomWithSeats[] = roomRows
    .map((r) => ({
      id: r.id,
      number: r.number,
      floor: r.floor,
      defaultRentPaisa: r.defaultRentPaisa,
      notes: r.notes,
      seats: seatsByRoom.get(r.id) ?? [],
    }))
    .sort((a, b) => compareRoomNumbers(a.number, b.number));

  return { building, rooms: roomList };
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export async function createBuilding(actor: SessionUser, input: CreateBuildingInput): Promise<string> {
  assertRole(actor, "admin");
  try {
    return await db().transaction(async (tx) => {
      const [created] = await tx
        .insert(buildings)
        .values({
          orgId: actor.orgId,
          code: input.code,
          name: input.name,
          address: input.address,
          landlordName: input.landlordName,
          landlordPhone: input.landlordPhone,
          landlordRentPaisa: input.landlordRent,
          notes: input.notes,
        })
        .returning();
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "building.create",
        entityType: "building",
        entityId: created.id,
        after: created,
      });
      return created.id;
    });
  } catch (e) {
    toAppError(e, { unique: `Building "${input.code}" already exists.` });
  }
}

export async function updateBuilding(actor: SessionUser, input: UpdateBuildingInput): Promise<void> {
  assertRole(actor, "admin");
  try {
    await db().transaction(async (tx) => {
      const before = await loadBuilding(tx, actor, input.buildingId);
      const [after] = await tx
        .update(buildings)
        .set({
          code: input.code,
          name: input.name,
          address: input.address,
          landlordName: input.landlordName,
          landlordPhone: input.landlordPhone,
          landlordRentPaisa: input.landlordRent,
          notes: input.notes,
        })
        .where(and(eq(buildings.id, before.id), eq(buildings.orgId, actor.orgId)))
        .returning();
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "building.update",
        entityType: "building",
        entityId: before.id,
        before,
        after,
      });
    });
  } catch (e) {
    toAppError(e, { unique: `Building "${input.code}" already exists.` });
  }
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function bulkCreateRooms(
  actor: SessionUser,
  input: BulkRoomsInput,
): Promise<{ created: string[]; skipped: string[]; seatsPerRoom: number }> {
  assertRole(actor, "admin");

  let numbers: string[];
  try {
    numbers = expandRoomRange(input.from, input.to);
  } catch (e) {
    throw new AppError("VALIDATION", (e as Error).message);
  }
  const labels = parseSeatsOrThrow(input.seats);

  return db().transaction(async (tx) => {
    const building = await loadBuilding(tx, actor, input.buildingId);

    const existing = await tx
      .select({ number: rooms.number })
      .from(rooms)
      .where(and(eq(rooms.buildingId, building.id), inArray(rooms.number, numbers)));
    const existingSet = new Set(existing.map((r) => r.number));
    const toCreate = numbers.filter((n) => !existingSet.has(n));

    if (toCreate.length > 0) {
      const createdRooms = await tx
        .insert(rooms)
        .values(
          toCreate.map((number) => ({
            orgId: actor.orgId,
            buildingId: building.id,
            number,
            floor: floorFromRoomNumber(number),
            defaultRentPaisa: input.defaultRent,
          })),
        )
        .returning({ id: rooms.id });

      await tx
        .insert(seats)
        .values(
          createdRooms.flatMap((room) =>
            labels.map((label) => ({ orgId: actor.orgId, buildingId: building.id, roomId: room.id, label })),
          ),
        );

      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "room.bulk_create",
        entityType: "building",
        entityId: building.id,
        after: { rooms: toCreate, seats: labels, defaultRentPaisa: input.defaultRent },
      });
    }

    return { created: toCreate, skipped: [...existingSet].sort(compareRoomNumbers), seatsPerRoom: labels.length };
  });
}

export async function createRoom(actor: SessionUser, input: CreateRoomInput): Promise<void> {
  assertRole(actor, "admin");
  const labels = parseSeatsOrThrow(input.seats);
  try {
    await db().transaction(async (tx) => {
      const building = await loadBuilding(tx, actor, input.buildingId);
      const [room] = await tx
        .insert(rooms)
        .values({
          orgId: actor.orgId,
          buildingId: building.id,
          number: input.number,
          floor: input.floor ?? floorFromRoomNumber(input.number),
          defaultRentPaisa: input.defaultRent,
        })
        .returning();
      await tx
        .insert(seats)
        .values(labels.map((label) => ({ orgId: actor.orgId, buildingId: building.id, roomId: room.id, label })));
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "room.create",
        entityType: "room",
        entityId: room.id,
        after: { ...room, seats: labels },
      });
    });
  } catch (e) {
    toAppError(e, { unique: `Room ${input.number} already exists in this building.` });
  }
}

export async function updateRoom(actor: SessionUser, input: UpdateRoomInput): Promise<void> {
  assertRole(actor, "admin");
  try {
    await db().transaction(async (tx) => {
      const before = await loadRoom(tx, actor, input.roomId);
      const [after] = await tx
        .update(rooms)
        .set({
          number: input.number,
          floor: input.floor ?? floorFromRoomNumber(input.number),
          defaultRentPaisa: input.defaultRent,
          notes: input.notes,
        })
        .where(and(eq(rooms.id, before.id), eq(rooms.orgId, actor.orgId)))
        .returning();
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "room.update",
        entityType: "room",
        entityId: before.id,
        before,
        after,
      });
    });
  } catch (e) {
    toAppError(e, { unique: `Room ${input.number} already exists in this building.` });
  }
}

/** Delete a room and its seats. The database refuses if any seat has ever had a student. */
export async function deleteRoom(actor: SessionUser, roomId: string): Promise<void> {
  assertRole(actor, "admin");
  try {
    await db().transaction(async (tx) => {
      const room = await loadRoom(tx, actor, roomId);
      await tx.delete(seats).where(and(eq(seats.roomId, room.id), eq(seats.orgId, actor.orgId)));
      await tx.delete(rooms).where(and(eq(rooms.id, room.id), eq(rooms.orgId, actor.orgId)));
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "room.delete",
        entityType: "room",
        entityId: room.id,
        before: room,
      });
    });
  } catch (e) {
    toAppError(e, { inUse: "This room has student history and cannot be deleted." });
  }
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export async function addSeat(actor: SessionUser, input: AddSeatInput): Promise<string> {
  assertRole(actor, "admin");
  try {
    return await db().transaction(async (tx) => {
      const room = await loadRoom(tx, actor, input.roomId);
      const existing = await tx.select({ label: seats.label }).from(seats).where(eq(seats.roomId, room.id));
      const label = input.label ?? nextSeatLabel(existing.map((s) => s.label));
      const [seat] = await tx
        .insert(seats)
        .values({ orgId: actor.orgId, buildingId: room.buildingId, roomId: room.id, label })
        .returning();
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "seat.create",
        entityType: "seat",
        entityId: seat.id,
        after: seat,
      });
      return label;
    });
  } catch (e) {
    toAppError(e, { unique: `Seat ${input.label ?? ""} already exists in this room.` });
  }
}

export async function setSeatReserved(actor: SessionUser, input: ReserveSeatInput): Promise<void> {
  assertRole(actor, "admin");
  await db().transaction(async (tx) => {
    const before = await loadSeat(tx, actor, input.seatId);
    const [after] = await tx
      .update(seats)
      .set({ isReserved: input.reserved, reservedNote: input.reserved ? input.note : null })
      .where(and(eq(seats.id, before.id), eq(seats.orgId, actor.orgId)))
      .returning();
    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: input.reserved ? "seat.reserve" : "seat.unreserve",
      entityType: "seat",
      entityId: before.id,
      before,
      after,
    });
  });
}

/** Delete a seat. The database refuses if a student has ever used it. */
export async function deleteSeat(actor: SessionUser, seatId: string): Promise<void> {
  assertRole(actor, "admin");
  try {
    await db().transaction(async (tx) => {
      const seat = await loadSeat(tx, actor, seatId);
      await tx.delete(seats).where(and(eq(seats.id, seat.id), eq(seats.orgId, actor.orgId)));
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorMembershipId: actor.membershipId,
        action: "seat.delete",
        entityType: "seat",
        entityId: seat.id,
        before: seat,
      });
    });
  } catch (e) {
    toAppError(e, { inUse: "This seat has student history and cannot be deleted." });
  }
}

// ---------------------------------------------------------------------------
// Cashier ↔ building assignment
// ---------------------------------------------------------------------------

/** membershipId -> building ids, for every cashier in the organization. */
export async function getCashierBuildingMap(actor: SessionUser): Promise<Map<string, string[]>> {
  assertRole(actor, "admin");
  const rows = await db()
    .select({ membershipId: membershipBuildings.membershipId, buildingId: membershipBuildings.buildingId })
    .from(membershipBuildings)
    .where(eq(membershipBuildings.orgId, actor.orgId));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.membershipId, [...(map.get(r.membershipId) ?? []), r.buildingId]);
  return map;
}

export async function setCashierBuildings(actor: SessionUser, input: CashierBuildingsInput): Promise<void> {
  assertRole(actor, "admin");
  const buildingIds = [...new Set(input.buildingIds)];

  await db().transaction(async (tx) => {
    const [member] = await tx
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.id, input.membershipId), eq(memberships.orgId, actor.orgId)))
      .limit(1);
    if (!member) throw new AppError("NOT_FOUND", "User not found.");
    if (member.role !== "cashier") throw new AppError("VALIDATION", "Only cashiers are limited to buildings.");

    if (buildingIds.length > 0) {
      const valid = await tx
        .select({ id: buildings.id })
        .from(buildings)
        .where(and(eq(buildings.orgId, actor.orgId), inArray(buildings.id, buildingIds)));
      if (valid.length !== buildingIds.length) throw new AppError("VALIDATION", "Unknown building selected.");
    }

    const before = await tx
      .select({ buildingId: membershipBuildings.buildingId })
      .from(membershipBuildings)
      .where(eq(membershipBuildings.membershipId, member.id));

    await tx.delete(membershipBuildings).where(eq(membershipBuildings.membershipId, member.id));
    if (buildingIds.length > 0) {
      await tx
        .insert(membershipBuildings)
        .values(buildingIds.map((buildingId) => ({ orgId: actor.orgId, membershipId: member.id, buildingId })));
    }

    await writeAudit(tx, {
      orgId: actor.orgId,
      actorMembershipId: actor.membershipId,
      action: "membership.set_buildings",
      entityType: "membership",
      entityId: member.id,
      before: before.map((b) => b.buildingId),
      after: buildingIds,
    });
  });
}
