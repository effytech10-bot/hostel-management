import { z } from "zod";
import { dateField, optionalText, requiredTaka } from "./fields";

export const FINANCE_KINDS = ["expense", "owner_withdraw", "owner_deposit"] as const;
export const FUND_KEYS = ["rent", "meal", "service"] as const;

export const financeEntrySchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(FINANCE_KINDS),
    fund: z.enum(FUND_KEYS, { message: "Choose the account" }),
    title: optionalText(120),
    category: optionalText(60),
    amount: requiredTaka("amount").refine((p) => p > 0, "Amount must be more than 0"),
    accountId: z.uuid({ message: "Choose where the money was paid from" }),
    buildingId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.uuid().nullable()),
    entryDate: dateField(),
    note: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "expense") return;
    if (!v.title || v.title.length < 2)
      ctx.addIssue({ code: "custom", path: ["title"], message: "Write what it was for" });
    if (!v.category) ctx.addIssue({ code: "custom", path: ["category"], message: "Choose or type a category" });
  });
export type FinanceEntryInput = z.infer<typeof financeEntrySchema>;

export const voidFinanceEntrySchema = z.object({
  entryId: z.uuid(),
  reason: z.string().trim().min(3, "Write why this is being cancelled").max(300),
});
export type VoidFinanceEntryInput = z.infer<typeof voidFinanceEntrySchema>;

export const paymentOrderSchema = z.object({ order: z.string().trim().min(1) });
