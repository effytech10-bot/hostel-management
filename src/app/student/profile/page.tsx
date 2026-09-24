import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { StudentStrip } from "@/components/student-portal/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTaka } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { getMyStudent } from "@/server/services/student-portal";

export const metadata: Metadata = { title: "My profile" };

export default async function StudentProfilePage() {
  const user = await requireRole("student");
  const me = await getMyStudent(user);

  const hostel: [string, string | null][] = [
    ["Student ID", me.studentCode],
    ["Building", me.current ? [me.current.buildingCode, me.current.buildingName].filter(Boolean).join(" · ") : null],
    ["Room / Seat", me.current ? `${me.current.roomNumber} / ${me.current.seatLabel}` : null],
    ["Seat rent (monthly)", me.current ? formatTaka(me.current.rentPaisa) : null],
    ["In this seat since", me.current?.startDate ?? null],
    ["Admission date", me.admissionDate],
    ["Left on", me.leftDate],
    ["Batch", me.batchName],
  ];
  const personal: [string, string | null][] = [
    ["Name", me.fullName],
    ["Father's name", me.fatherName],
    ["Phone (login)", me.phone],
    ["Guardian's phone", me.guardianPhone],
    ["Permanent address", me.permanentAddress],
    ["School", me.school],
    ["College", me.college],
    ["Class / Year", me.classYear],
    ["Group", me.group],
    ["Roll", me.roll],
  ];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title="My profile" />
      <StudentStrip me={me} />
      <Card>
        <CardHeader>
          <CardTitle>Hostel</CardTitle>
        </CardHeader>
        <CardContent>
          <Details rows={hostel} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
        </CardHeader>
        <CardContent>
          <Details rows={personal} />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-sm">To correct any of this, tell the hostel office.</p>
      <Button asChild variant="outline" className="self-start">
        <Link href="/change-password">
          <KeyRound />
          Change password
        </Link>
      </Button>
    </div>
  );
}

function Details({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
