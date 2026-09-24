import { Field } from "@/components/forms/field";

export type ProfileDefaults = {
  fullName?: string;
  fatherName?: string | null;
  phone?: string;
  guardianPhone?: string | null;
  permanentAddress?: string | null;
  school?: string | null;
  college?: string | null;
  classYear?: string | null;
  group?: string | null;
  roll?: string | null;
  batchName?: string | null;
  notes?: string | null;
};

/** The personal + education fields shared by the admission and edit forms. */
export function ProfileFields({
  d = {},
  errors,
  batches,
}: {
  d?: ProfileDefaults;
  errors?: Record<string, string[] | undefined>;
  batches: string[];
}) {
  return (
    <>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Personal</legend>
        <Field name="fullName" label="Student name *" defaultValue={d.fullName} required errors={errors} />
        <Field name="fatherName" label="Father / guardian name" defaultValue={d.fatherName ?? ""} errors={errors} />
        <Field
          name="phone"
          label="Student phone * (used to log in)"
          type="tel"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          defaultValue={d.phone}
          required
          errors={errors}
        />
        <Field
          name="guardianPhone"
          label="Guardian phone"
          type="tel"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          defaultValue={d.guardianPhone ?? ""}
          errors={errors}
        />
        <Field
          name="permanentAddress"
          label="Permanent address"
          defaultValue={d.permanentAddress ?? ""}
          errors={errors}
          wrapperClassName="sm:col-span-2"
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold">Education</legend>
        <Field name="school" label="School" defaultValue={d.school ?? ""} errors={errors} />
        <Field name="college" label="College" defaultValue={d.college ?? ""} errors={errors} />
        <Field name="classYear" label="Class / year" defaultValue={d.classYear ?? ""} errors={errors} />
        <Field name="group" label="Group" placeholder="Science" defaultValue={d.group ?? ""} errors={errors} />
        <Field name="roll" label="Roll" defaultValue={d.roll ?? ""} errors={errors} />
        <Field
          name="batchName"
          label="Batch"
          placeholder="2026"
          list="batch-options"
          defaultValue={d.batchName ?? ""}
          hint="Pick one or type a new batch"
          errors={errors}
        />
        <datalist id="batch-options">
          {batches.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </fieldset>

      <Field name="notes" label="Notes" defaultValue={d.notes ?? ""} errors={errors} />
    </>
  );
}
