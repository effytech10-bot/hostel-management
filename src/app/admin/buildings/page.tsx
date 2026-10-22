import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/server/auth/session";
import { listBuildings } from "@/server/services/buildings";
import { BuildingForm } from "./building-form";

export const metadata: Metadata = { title: "Buildings" };

export default async function BuildingsPage() {
  const actor = await requireRole("admin");
  const list = await listBuildings(actor);

  return (
    <>
      <PageHeader title="Buildings" description="Every rented house, with its rooms and seats." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>All buildings ({list.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-muted text-sm py-4">No buildings yet. Add the first one below.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Rooms</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Occupied</TableHead>
                  <TableHead className="text-right">Vacant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/admin/buildings/${b.id}`} className="text-brand font-bold hover:underline">
                        {b.code}
                      </Link>
                      {b.name && <span className="text-muted text-xs ml-2">{b.name}</span>}
                    </TableCell>
                    <TableCell className="text-muted max-w-64 truncate">{b.address ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.rooms}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-ink">{b.seats}</TableCell>
                    <TableCell className="text-right tabular-nums text-brand font-semibold">{b.occupied}</TableCell>
                    <TableCell className="text-right tabular-nums text-ok font-semibold">{b.seats - b.occupied - b.reserved}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a building</CardTitle>
          <CardDescription>After saving you will add its rooms and seats.</CardDescription>
        </CardHeader>
        <CardContent>
          <BuildingForm />
        </CardContent>
      </Card>
    </>
  );
}
