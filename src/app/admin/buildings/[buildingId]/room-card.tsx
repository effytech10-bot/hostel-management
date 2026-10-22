"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/errors";
import type { RoomWithSeats } from "@/server/services/buildings";
import { addSeatAction, deleteRoomAction, deleteSeatAction, reserveSeatAction, updateRoomAction } from "../actions";

export function RoomCard({ room }: { room: RoomWithSeats }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface shadow-card p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold text-ink text-[14px]">Room {room.number}</p>
        <p className="text-muted text-xs tabular-nums">
          {room.defaultRentPaisa != null ? formatTaka(room.defaultRentPaisa) : "No default rent"}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {room.seats.length === 0 && <span className="text-muted text-xs">No seats</span>}
        {room.seats.map((seat) =>
          seat.occupant ? (
            <Link
              key={seat.id}
              href={`/admin/students/${seat.occupant.studentId}`}
              title={`${seat.occupant.name} (ID ${seat.occupant.code})`}
              className="inline-flex h-7 max-w-40 items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 text-xs font-semibold text-brand hover:bg-brand-100/70 transition-colors"
            >
              <span>{seat.label}</span>
              <span className="truncate font-normal text-ink-2">· {seat.occupant.name}</span>
            </Link>
          ) : (
            <span
              key={seat.id}
              title={seat.isReserved ? `Reserved${seat.reservedNote ? `: ${seat.reservedNote}` : ""}` : "Vacant"}
              className={cn(
                "inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold",
                seat.isReserved
                  ? "border-warn-line bg-warn-bg text-warn"
                  : "border-ok-line bg-ok-bg text-ok",
              )}
            >
              {seat.label}
            </span>
          ),
        )}
      </div>

      <details className="group mt-3">
        <summary className="text-brand font-semibold cursor-pointer text-xs select-none hover:underline">
          Manage room
        </summary>
        <div className="mt-3 flex flex-col gap-4 border-t border-line-2 pt-3">
          <EditRoomForm room={room} />

          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs font-semibold">Seats</p>
            {room.seats.map((seat) => (
              <div key={seat.id} className="flex flex-wrap items-center gap-2">
                <span className="w-8 text-sm font-bold text-ink">{seat.label}</span>
                {seat.occupant ? (
                  <span className="text-muted text-xs">Occupied by {seat.occupant.name}</span>
                ) : (
                  <>
                    <ActionButton
                      action={reserveSeatAction}
                      fields={{ seatId: seat.id, reserved: seat.isReserved ? "false" : "true" }}
                    >
                      {seat.isReserved ? "Unreserve" : "Reserve"}
                    </ActionButton>
                    <ActionButton
                      action={deleteSeatAction}
                      fields={{ seatId: seat.id }}
                      variant="ghost"
                      confirm={`Delete seat ${seat.label} in room ${room.number}?`}
                      pendingLabel="Deleting…"
                    >
                      Delete
                    </ActionButton>
                  </>
                )}
              </div>
            ))}
            <ActionButton action={addSeatAction} fields={{ roomId: room.id }} pendingLabel="Adding…">
              + Add seat
            </ActionButton>
          </div>

          <ActionButton
            action={deleteRoomAction}
            fields={{ roomId: room.id }}
            variant="destructive"
            confirm={`Delete room ${room.number} and all its seats?`}
            pendingLabel="Deleting…"
          >
            Delete room
          </ActionButton>
        </div>
      </details>
    </div>
  );
}

function EditRoomForm({ room }: { room: RoomWithSeats }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateRoomAction, {});
  const e = state.fieldErrors;
  return (
    <form action={formAction} className="grid grid-cols-2 gap-2">
      <input type="hidden" name="roomId" value={room.id} />
      <Field name="number" label="Number" defaultValue={room.number} required errors={e} id={`n-${room.id}`} />
      <Field
        name="floor"
        label="Floor"
        defaultValue={room.floor ?? ""}
        inputMode="numeric"
        errors={e}
        id={`f-${room.id}`}
      />
      <Field
        name="defaultRent"
        label="Default rent (৳)"
        inputMode="decimal"
        defaultValue={room.defaultRentPaisa != null ? formatTaka(room.defaultRentPaisa, { symbol: false }) : ""}
        errors={e}
        id={`r-${room.id}`}
      />
      <Field name="notes" label="Notes" defaultValue={room.notes ?? ""} errors={e} id={`o-${room.id}`} />
      <div className="col-span-2 flex flex-col gap-2">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" size="sm" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Save room"}
        </Button>
      </div>
    </form>
  );
}
