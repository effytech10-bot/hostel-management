"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { admitStudentAction, type AdmissionState } from "@/app/_actions/students";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Note } from "@/components/ui/note";
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
      <Card className="border-ok-line">
        <CardHeader>
          <CardTitle className="text-ok">Student admitted ✓</CardTitle>
          <CardDescription>{a.seatText}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="bg-surface-2 border-line-2 grid gap-3 rounded-[12px] border p-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-xs font-medium">Student ID</p>
              <p className="text-2xl font-bold tabular-nums font-mono">{a.studentCode}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">First password (last 6 digits of phone)</p>
              <p className="font-mono text-2xl font-bold text-brand">{a.password}</p>
            </div>
          </div>
          <p className="text-muted-foreground text-[13px] leading-normal">
            The student logs in with their phone number or Student ID and this password, then chooses their own
            password. If they forget it, reset it from the student&apos;s page.
          </p>
          <div className="border-line-2 bg-surface rounded-[12px] border p-4 text-[13.5px]">
            <p className="text-ink mb-2 font-semibold">
              Token <span className="font-mono text-brand">{a.firstBill.code}</span>
            </p>
            {(["current", "due"] as const).map((section) => (
              <div key={section} className="mt-2.5">
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                  {section === "current" ? "This month" : "Due"}
                </p>
                {a.firstBill.lines
                  .filter((l) => l.section === section)
                  .map((l) => (
                    <div key={l.label} className="border-line-2 flex justify-between gap-4 border-b py-1.5">
                      <span>
                        {l.label}
                        {l.detail && <span className="text-muted-foreground ml-2 text-xs">{l.detail}</span>}
                      </span>
                      <span className="tabular-nums font-medium">{formatTaka(l.amountPaisa)}</span>
                    </div>
                  ))}
              </div>
            ))}
            <div className="border-line mt-3 flex justify-between gap-4 border-t pt-2 font-bold text-[14.5px]">
              <span>Total</span>
              <span className="tabular-nums">{formatTaka(a.firstBill.totalPaisa)}</span>
            </div>
          </div>
          {a.photoWarning && <FormMessage error={a.photoWarning} />}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link href={`${basePath}/${a.studentId}`}>Open student</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${basePath.replace("/students", "/tokens")}/${a.firstBill.code}`}>
                Open token & take payment
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

      <fieldset className="flex flex-col gap-4 border-t border-line-2 pt-4">
        <legend className="mb-2 text-sm font-semibold text-ink-2">Seat & rent</legend>
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

      <fieldset className="flex flex-col gap-4 border-t border-line-2 pt-4">
        <legend className="mb-2 text-sm font-semibold text-ink-2">Photo, first token & login</legend>
        <PhotoInput />
        <Note variant="info" className="text-xs">
          The token for the admission month is made right away, whatever the day: the full month&apos;s rent, the meal
          deposit, the advance and the one-time service charge. From next month tokens are made automatically.
        </Note>
        <p className="text-muted-foreground text-xs leading-normal">
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
