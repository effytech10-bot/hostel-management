import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getBuildingDetail, type RoomWithSeats } from "@/server/services/buildings";
import { BuildingForm } from "../building-form";
import { BulkRoomsForm, SingleRoomForm } from "./add-rooms-forms";
import { RoomCard } from "./room-card";

export const metadata: Metadata = { title: "Building" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function floorLabel(floor: number | null): string {
  if (floor === null) return "Other rooms";
  if (floor === 0) return "Ground floor";
  const suffix =
    floor % 10 === 1 && floor !== 11
      ? "st"
      : floor % 10 === 2 && floor !== 12
        ? "nd"
        : floor % 10 === 3 && floor !== 13
          ? "rd"
          : "th";
  return `${floor}${suffix} floor`;
}

function groupByFloor(rooms: RoomWithSeats[]): [number | null, RoomWithSeats[]][] {
  const groups = new Map<number | null, RoomWithSeats[]>();
  for (const room of rooms) groups.set(room.floor, [...(groups.get(room.floor) ?? []), room]);
  return [...groups.entries()].sort(([a], [b]) => (a ?? 999) - (b ?? 999));
}

export default async function BuildingPage({ params }: { params: Promise<{ buildingId: string }> }) {
  const actor = await requireRole("admin");
  const { buildingId } = await params;
  if (!UUID_RE.test(buildingId)) notFound();

  let detail;
  try {
    detail = await getBuildingDetail(actor, buildingId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { building, rooms } = detail;

  const seatCount = rooms.reduce((n, r) => n + r.seats.length, 0);
  const occupied = rooms.reduce((n, r) => n + r.seats.filter((s) => s.occupant).length, 0);
  const reserved = rooms.reduce((n, r) => n + r.seats.filter((s) => !s.occupant && s.isReserved).length, 0);
  const stats = [
    { label: "Rooms", value: rooms.length },
    { label: "Seats", value: seatCount },
    { label: "Occupied", value: occupied },
    { label: "Vacant", value: seatCount - occupied - reserved },
    { label: "Reserved", value: reserved },
  ];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/buildings" className="text-muted-foreground hover:underline">
          ← All buildings
        </Link>
      </p>
      <PageHeader
        title={`Building ${building.code}`}
        description={[building.name, building.address].filter(Boolean).join(" · ") || undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add rooms</CardTitle>
          <CardDescription>
            Add a whole floor at once. Rooms that already exist are skipped. The floor is taken from the room number
            (601 → 6th floor).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <BulkRoomsForm buildingId={building.id} />
          <details>
            <summary className="text-primary cursor-pointer text-sm select-none">
              Add a single room with a special number
            </summary>
            <div className="mt-4">
              <SingleRoomForm buildingId={building.id} />
            </div>
          </details>
        </CardContent>
      </Card>

      {rooms.length === 0 ? (
        <Card className="mb-6">
          <CardContent className="text-muted-foreground text-sm">No rooms yet.</CardContent>
        </Card>
      ) : (
        <div className="mb-6 flex flex-col gap-6">
          <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-emerald-300 bg-emerald-50" /> Vacant
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-amber-300 bg-amber-50" /> Reserved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-blue-300 bg-blue-50" /> Occupied (click to open the
              student)
            </span>
          </div>
          {groupByFloor(rooms).map(([floor, floorRooms]) => (
            <section key={floor ?? "other"}>
              <h2 className="text-muted-foreground mb-2 text-sm font-semibold">
                {floorLabel(floor)} · {floorRooms.length} room(s)
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {floorRooms.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Building details</CardTitle>
        </CardHeader>
        <CardContent>
          <BuildingForm
            building={{
              id: building.id,
              code: building.code,
              name: building.name,
              address: building.address,
              landlordName: building.landlordName,
              landlordPhone: building.landlordPhone,
              landlordRentPaisa: building.landlordRentPaisa,
              notes: building.notes,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
