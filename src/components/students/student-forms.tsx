"use client";

import { useActionState, useState } from "react";
import { resetStudentPasswordAction, transferSeatAction, updateStudentAction } from "@/app/_actions/students";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { dhakaDate } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { ActionState } from "@/server/errors";
import { PhotoInput } from "./photo-input";
import { ProfileFields, type ProfileDefaults } from "./profile-fields";
import { SeatPicker, type SeatOption } from "./seat-picker";

export function EditProfileForm({
  studentId,
  defaults,
  batches,
  photoUrl,
}: {
  studentId: string;
  defaults: ProfileDefaults;
  batches: string[];
  photoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateStudentAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="studentId" value={studentId} />
      <PhotoInput currentUrl={photoUrl} label="Change photo" />
      <ProfileFields d={defaults} errors={state.fieldErrors} batches={batches} />
      <FormMessage error={state.error} message={state.message} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

/** Change seat, or keep the seat and change the monthly rent. */
export function TransferForm({
  studentId,
  seats,
  currentSeatId,
  currentRentPaisa,
}: {
  studentId: string;
  seats: SeatOption[];
  currentSeatId: string;
  currentRentPaisa: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transferSeatAction, {});
  const [rent, setRent] = useState(formatTaka(currentRentPaisa, { symbol: false }));
  const e = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={studentId} />
      <SeatPicker
        seats={seats}
        defaultSeatId={currentSeatId}
        errors={e?.seatId}
        onSeatChange={(seat) => {
          if (seat && !seat.isCurrent && seat.defaultRentPaisa != null) {
            setRent(formatTaka(seat.defaultRentPaisa, { symbol: false }));
          }
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="rent"
          label="Monthly rent (৳)"
          inputMode="decimal"
          value={rent}
          onChange={(ev) => setRent(ev.target.value)}
          required
          errors={e}
        />
        <Field name="date" label="From date" type="date" defaultValue={dhakaDate()} errors={e} />
      </div>
      <FormMessage error={state.error} message={state.message} />
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save seat / rent"}
      </Button>
    </form>
  );
}

export function ResetStudentPasswordForm({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resetStudentPasswordAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="studentId" value={studentId} />
      <Field
        name="password"
        label="Temporary password"
        placeholder="Empty = last 6 digits of phone"
        errors={state.fieldErrors}
      />
      {state.ok && state.message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Temporary password: <span className="font-mono text-base font-semibold">{state.message}</span>. The student
          sets their own password after logging in.
        </p>
      )}
      <FormMessage error={state.error} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="w-fit">
        {pending ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
