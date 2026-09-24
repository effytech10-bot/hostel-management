import { z } from "zod";
import { dateField, optionalPhone, optionalText, requiredPhone, requiredTaka } from "./fields";

const profileFields = {
  fullName: z.string().trim().min(2, "Enter the student's name").max(100),
  fatherName: optionalText(100),
  phone: requiredPhone(),
  guardianPhone: optionalPhone(),
  permanentAddress: optionalText(300),
  school: optionalText(150),
  college: optionalText(150),
  classYear: optionalText(40),
  group: optionalText(40),
  roll: optionalText(40),
  batchName: optionalText(40),
  notes: optionalText(500),
};

const optionalPassword = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    if (v.length < 6) {
      ctx.addIssue({
        code: "custom",
        message: "Password must be at least 6 characters (or leave empty to generate one)",
      });
      return z.NEVER;
    }
    return v;
  });

export const admissionSchema = z.object({
  ...profileFields,
  seatId: z.uuid({ message: "Choose a seat" }),
  rent: requiredTaka("monthly rent"),
  admissionDate: dateField(),
  /** Create the first bill (advance + first month). Off only when bringing in existing students. */
  firstBill: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});
export type AdmissionInput = z.infer<typeof admissionSchema>;

export const updateProfileSchema = z.object({ studentId: z.uuid(), ...profileFields });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const transferSchema = z.object({
  studentId: z.uuid(),
  seatId: z.uuid({ message: "Choose a seat" }),
  rent: requiredTaka("monthly rent"),
  date: dateField(),
});
export type TransferInput = z.infer<typeof transferSchema>;

export const studentPasswordSchema = z.object({ studentId: z.uuid(), password: optionalPassword });
export type StudentPasswordInput = z.infer<typeof studentPasswordSchema>;
