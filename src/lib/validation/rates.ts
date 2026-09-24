import { z } from "zod";
import { isValidPeriod } from "@/lib/dates";
import { optionalText, requiredTaka } from "./fields";

export const ratesSchema = z.object({
  period: z.string().refine((v) => isValidPeriod(v), "Choose a month"),
  breakfastRate: requiredTaka("breakfast rate"),
  lunchRate: requiredTaka("lunch rate"),
  dinnerRate: requiredTaka("dinner rate"),
  mealDeposit: requiredTaka("meal deposit"),
  baburchi: requiredTaka("baburchi bill"),
  serviceCharge: requiredTaka("service charge"),
  serviceChargeThisMonth: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  advanceMonths: z.coerce
    .number({ message: "Enter a number of months" })
    .int("Whole months only")
    .min(0, "0 to 12 months")
    .max(12, "0 to 12 months"),
  midMonthRule: z.enum(["prorata", "full"]).default("prorata"),
  notes: optionalText(300),
});
export type RatesInput = z.infer<typeof ratesSchema>;
