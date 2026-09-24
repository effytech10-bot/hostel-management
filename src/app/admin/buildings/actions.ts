"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addSeatSchema,
  bulkRoomsSchema,
  createBuildingSchema,
  createRoomSchema,
  reserveSeatSchema,
  roomIdSchema,
  seatIdSchema,
  updateBuildingSchema,
  updateRoomSchema,
} from "@/lib/validation/buildings";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import {
  addSeat,
  bulkCreateRooms,
  createBuilding,
  createRoom,
  deleteRoom,
  deleteSeat,
  setSeatReserved,
  updateBuilding,
  updateRoom,
} from "@/server/services/buildings";

function refresh() {
  revalidatePath("/admin/buildings", "layout");
  revalidatePath("/admin");
}

export async function createBuildingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state, value } = await runForm(createBuildingSchema, formToObject(formData), (d) => createBuilding(actor, d));
  if (!value) return state;
  refresh();
  redirect(`/admin/buildings/${value}`);
}

export async function updateBuildingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(updateBuildingSchema, formToObject(formData), (d) => updateBuilding(actor, d));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Building details saved." } : state;
}

export async function bulkRoomsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state, value } = await runForm(bulkRoomsSchema, formToObject(formData), (d) => bulkCreateRooms(actor, d));
  if (!value) return state;
  refresh();
  const parts = [`Added ${value.created.length} room(s) with ${value.seatsPerRoom} seat(s) each.`];
  if (value.skipped.length) parts.push(`Skipped existing: ${value.skipped.join(", ")}.`);
  return { ok: true, message: parts.join(" ") };
}

export async function createRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(createRoomSchema, formToObject(formData), (d) => createRoom(actor, d));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Room added." } : state;
}

export async function updateRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(updateRoomSchema, formToObject(formData), (d) => updateRoom(actor, d));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Room saved." } : state;
}

export async function deleteRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(roomIdSchema, formToObject(formData), (d) => deleteRoom(actor, d.roomId));
  if (state.ok) refresh();
  return state;
}

export async function addSeatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(addSeatSchema, formToObject(formData), (d) => addSeat(actor, d));
  if (state.ok) refresh();
  return state;
}

export async function reserveSeatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(reserveSeatSchema, formToObject(formData), (d) => setSeatReserved(actor, d));
  if (state.ok) refresh();
  return state;
}

export async function deleteSeatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const { state } = await runForm(seatIdSchema, formToObject(formData), (d) => deleteSeat(actor, d.seatId));
  if (state.ok) refresh();
  return state;
}
