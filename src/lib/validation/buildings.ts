import { z } from "zod";
import { booleanField, optionalInt, optionalPhone, optionalTaka, optionalText } from "./fields";

const buildingFields = {
  code: z.string().trim().min(1, "Enter the building number, e.g. 207 or 178/A").max(20),
  name: optionalText(80),
  address: optionalText(300),
  landlordName: optionalText(100),
  landlordPhone: optionalPhone(),
  landlordRent: optionalTaka(),
  notes: optionalText(500),
};

export const createBuildingSchema = z.object(buildingFields);
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;

export const updateBuildingSchema = z.object({ buildingId: z.uuid(), ...buildingFields });
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>;

const seatsField = z.string().trim().min(1, 'Enter seats per room (e.g. 2) or labels (e.g. "A,B")');

export const bulkRoomsSchema = z.object({
  buildingId: z.uuid(),
  from: z.string().trim().min(1, "First room number"),
  to: z.string().trim().min(1, "Last room number"),
  seats: seatsField,
  defaultRent: optionalTaka(),
});
export type BulkRoomsInput = z.infer<typeof bulkRoomsSchema>;

export const createRoomSchema = z.object({
  buildingId: z.uuid(),
  number: z.string().trim().min(1, "Enter the room number").max(10),
  floor: optionalInt(-2, 60),
  seats: seatsField,
  defaultRent: optionalTaka(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  roomId: z.uuid(),
  number: z.string().trim().min(1, "Enter the room number").max(10),
  floor: optionalInt(-2, 60),
  defaultRent: optionalTaka(),
  notes: optionalText(300),
});
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const roomIdSchema = z.object({ roomId: z.uuid() });

export const addSeatSchema = z.object({
  roomId: z.uuid(),
  label: optionalText(4).transform((v) => (v ? v.toUpperCase() : null)),
});
export type AddSeatInput = z.infer<typeof addSeatSchema>;

export const seatIdSchema = z.object({ seatId: z.uuid() });

export const reserveSeatSchema = z.object({
  seatId: z.uuid(),
  reserved: booleanField(),
  note: optionalText(200),
});
export type ReserveSeatInput = z.infer<typeof reserveSeatSchema>;

export const cashierBuildingsSchema = z.object({
  membershipId: z.uuid(),
  buildingIds: z.array(z.uuid()).max(200),
});
export type CashierBuildingsInput = z.infer<typeof cashierBuildingsSchema>;
