import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { StudentStrip } from "@/components/student-portal/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
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
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-bold text-ink">My profile</h1>
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

      <p className="text-muted text-[12.5px] px-1">To correct any of this, tell the hostel office.</p>

      <div className="flex flex-col gap-2 pt-1">
        <Button asChild variant="outline" className="w-full justify-center gap-2">
          <Link href="/change-password">
            <KeyRound className="size-4" />
            <span>Change password</span>
          </Link>
        </Button>
        <form action={logoutAction} className="w-full">
          <Button
            type="submit"
            variant="ghost"
            className="text-muted hover:text-bad hover:bg-bad-bg/60 w-full justify-center gap-2"
          >
            <LogOut className="size-4" />
            <span>Log out</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

const MONO_FIELDS = new Set(["Student ID", "Phone (login)", "Guardian's phone"]);

function Details({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-[13.5px]">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted text-[12.5px] font-medium">{k}</dt>
            <dd className={cn("text-ink break-words", MONO_FIELDS.has(k) && "font-mono font-medium")}>{v}</dd>
          </div>
        ))}
    </dl>
  );
}
