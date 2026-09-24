import { z } from "zod";
import { isValidDate } from "@/lib/dates";
import { dhakaDate } from "@/lib/dates";
import { optionalText, requiredTaka } from "./fields";

export const leaveSchema = z.object({
  studentId: z.uuid(),
  lastDay: z
    .string()
    .optional()
    .transform((v) => v || dhakaDate())
    .refine((v) => isValidDate(v), "Enter a valid date"),
  /** Pay back the student's credit now from this account (optional). */
  refundAccountId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
});
export type LeaveInput = z.infer<typeof leaveSchema>;

export const refundSchema = z.object({
  studentId: z.uuid(),
  amount: requiredTaka("amount").refine((p) => p > 0, "Amount must be more than 0"),
  accountId: z.uuid({ message: "Choose the account the money is paid from" }),
  note: optionalText(300),
});
export type RefundInput = z.infer<typeof refundSchema>;
