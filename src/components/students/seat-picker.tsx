"use client";

import { useMemo, useState } from "react";
import { FieldError } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AvailableSeat } from "@/server/services/students";

export type SeatOption = AvailableSeat & { isCurrent?: boolean };

/**
 * Building → seat picker. Only seats with nobody in them are listed (plus the student's current seat
 * when changing rent). Calls onSeatChange so the form can pre-fill the room's default rent.
 */
export function SeatPicker({
  seats,
  defaultSeatId,
  errors,
  onSeatChange,
}: {
  seats: SeatOption[];
  defaultSeatId?: string;
  errors?: string[];
  onSeatChange?: (seat: SeatOption | null) => void;
}) {
  const buildings = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seats) map.set(s.buildingId, s.buildingCode);
    return [...map.entries()].map(([id, code]) => ({ id, code }));
  }, [seats]);

  const initial = seats.find((s) => s.seatId === defaultSeatId);
  const [buildingId, setBuildingId] = useState(initial?.buildingId ?? (buildings.length === 1 ? buildings[0].id : ""));
  const [seatId, setSeatId] = useState(initial?.seatId ?? "");

  const rooms = useMemo(() => {
    const map = new Map<string, SeatOption[]>();
    for (const s of seats.filter((s) => s.buildingId === buildingId)) {
      map.set(s.roomNumber, [...(map.get(s.roomNumber) ?? []), s]);
    }
    return [...map.entries()];
  }, [seats, buildingId]);

  function chooseSeat(id: string) {
    setSeatId(id);
    onSeatChange?.(seats.find((s) => s.seatId === id) ?? null);
  }

  if (seats.length === 0) {
    return <p className="text-sm text-amber-700">No free seats. Add rooms/seats in Buildings first.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="building-pick">Building</Label>
        <Select
          id="building-pick"
          value={buildingId}
          onChange={(e) => {
            setBuildingId(e.target.value);
            chooseSeat("");
          }}
        >
          <option value="">Choose building…</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="seatId">Room & seat</Label>
        <Select
          id="seatId"
          name="seatId"
          value={seatId}
          onChange={(e) => chooseSeat(e.target.value)}
          disabled={!buildingId}
          aria-invalid={!!errors?.length}
        >
          <option value="">{buildingId ? "Choose seat…" : "Choose a building first"}</option>
          {rooms.map(([roomNumber, roomSeats]) => (
            <optgroup key={roomNumber} label={`Room ${roomNumber}`}>
              {roomSeats.map((s) => (
                <option key={s.seatId} value={s.seatId}>
                  {roomNumber}-{s.label}
                  {s.isCurrent
                    ? " (current seat)"
                    : s.isReserved
                      ? ` (reserved${s.reservedNote ? `: ${s.reservedNote}` : ""})`
                      : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <FieldError errors={errors} />
      </div>
    </div>
  );
}
