import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your phone number or Student ID"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
