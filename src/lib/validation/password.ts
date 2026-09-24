import { z } from "zod";

export const changePasswordSchema = z
  .object({
    password: z.string().min(1, "Enter a new password"),
    confirm: z.string().min(1, "Type the new password again"),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match" });
