"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { admitStudentAction, type AdmissionState } from "@/app/_actions/students";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { dhakaDate } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { PhotoInput } from "./photo-input";
import { ProfileFields } from "./profile-fields";
import { SeatPicker, type SeatOption } from "./seat-picker";

export function AdmissionForm({
  seats,
  batches,
  basePath,
}: {
  seats: SeatOption[];
  batches: string[];
  basePath: string;
}) {
  const [state, formAction, pending] = useActionState<AdmissionState, FormData>(admitStudentAction, {});
  const [rent, setRent] = useState("");

  if (state.admitted) {
    const a = state.admitted;
    return (
      <Card className="border-emerald-300">
        <CardHeader>
          <CardTitle>Student admitted ✓</CardTitle>
          <CardDescription>{a.seatText}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="bg-muted grid gap-3 rounded-lg p-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-xs">Student ID</p>
              <p className="text-2xl font-semibold tabular-nums">{a.studentCode}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">First password (last 6 digits of phone)</p>
              <p className="font-mono text-2xl font-semibold">{a.password}</p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            The student logs in with their phone number or Student ID and this password, then chooses their own
            password. If they forget it, reset it from the student&apos;s page.
          </p>
          {a.firstBill && (
            <div className="rounded-lg border p-4 text-sm">
              <p className="mb-2 font-semibold">First bill</p>
              {a.firstBill.lines.map((l) => (
                <div key={l.label} className="flex justify-between gap-4">
                  <span>{l.label}</span>
                  <span className="tabular-nums">{formatTaka(l.amountPaisa)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between gap-4 border-t pt-2 font-semibold">
                <span>To be paid</span>
                <span className="tabular-nums">{formatTaka(a.firstBill.totalPaisa)}</span>
              </div>
            </div>
          )}
          {a.photoWarning && <FormMessage error={a.photoWarning} />}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`${basePath}/${a.studentId}`}>Open student</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${basePath.replace("/students", "/payments")}/new?student=${a.studentId}`}>
                Take payment
              </Link>
            </Button>
            <Button
              variant="outline"
              // A fresh page load clears the finished form and its result.
              onClick={() => window.location.reload()}
            >
              Admit another student
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const e = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <ProfileFields errors={e} batches={batches} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold">Seat & rent</legend>
        <SeatPicker
          seats={seats}
          errors={e?.seatId}
          onSeatChange={(seat) => {
            if (seat?.defaultRentPaisa != null) setRent(formatTaka(seat.defaultRentPaisa, { symbol: false }));
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="rent"
            label="Monthly rent (৳) *"
            inputMode="decimal"
            value={rent}
            onChange={(ev) => setRent(ev.target.value)}
            hint="Filled from the room's default rent; change it if this student pays differently"
            required
            errors={e}
          />
          <Field name="admissionDate" label="Admission date" type="date" defaultValue={dhakaDate()} errors={e} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold">Photo, first bill & login</legend>
        <PhotoInput />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="firstBill" defaultChecked className="mt-0.5" />
          <span>
            <span className="font-medium">Make the first bill now</span>
            <span className="text-muted-foreground block">
              Advance (months of rent from Settings) + this month&apos;s rent, meal deposit and baburchi. Joining after
              the 1st is charged by days if the Settings rule says so. Untick only when bringing in an existing student
              whose dues you will enter separately.
            </span>
          </span>
        </label>
        <p className="text-muted-foreground text-sm">
          Login: the student uses their phone number (or Student ID). The first password is the last 6 digits of their
          phone number; they must set their own password at the first login.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3">
        <FormMessage error={state.error} />
        <Button type="submit" size="lg" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Admit student"}
        </Button>
      </div>
    </form>
  );
}
