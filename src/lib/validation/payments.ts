import { z } from "zod";
import { isValidDate, isValidPeriod } from "@/lib/dates";
import { tryParseTaka } from "@/lib/money";
import { dateField, optionalText, requiredTaka } from "./fields";

export const PAYMENT_METHODS = ["cash", "bkash", "nagad", "bank", "other"] as const;
export const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  bkash: "bKash",
  nagad: "Nagad",
  bank: "Bank",
  other: "Other",
};

export const paymentSchema = z.object({
  requestId: z.uuid(),
  studentId: z.uuid(),
  amount: requiredTaka("amount").refine((p) => p > 0, "Amount must be more than 0"),
  accountId: z.uuid({ message: "Choose where the money was received" }),
  trxId: optionalText(60).transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null)),
  paidDate: dateField(),
  note: optionalText(300),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const voidPaymentSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(3, "Write why this payment is being voided").max(300),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const ADJUSTABLE_HEADS = ["rent", "meal", "baburchi", "service_charge", "advance", "other"] as const;

export const adjustmentSchema = z.object({
  studentId: z.uuid(),
  head: z.enum(ADJUSTABLE_HEADS, { message: "Choose what this is for" }),
  period: z.string().refine((v) => isValidPeriod(v), "Choose a month"),
  direction: z.enum(["charge", "reduce"]),
  amount: requiredTaka("amount").refine((p) => p > 0, "Amount must be more than 0"),
  description: z.string().trim().min(3, "Write a short reason").max(300),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const paymentAccountSchema = z.object({
  name: z.string().trim().min(2, "Enter a name, e.g. bKash 01867-271100 (Nayan)").max(80),
  method: z.enum(PAYMENT_METHODS),
  details: optionalText(200),
});
export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;

export const accountIdSchema = z.object({ accountId: z.uuid() });

/** Used by the collection list filters. */
export function parseDateParam(v: string | undefined, fallback: string): string {
  return v && isValidDate(v) ? v : fallback;
}

export function parseAmountParam(v: string | undefined): number | null {
  return v ? tryParseTaka(v) : null;
}
