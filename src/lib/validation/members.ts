import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";

export const PASSWORD_MIN = 8;

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeBdPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)" });
      return z.NEVER;
    }
    return normalized;
  });

const password = z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`);

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name"),
  phone,
  role: z.enum(["admin", "cashier"], { message: "Choose a role" }),
  password,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const resetPasswordSchema = z.object({
  membershipId: z.uuid(),
  password,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
