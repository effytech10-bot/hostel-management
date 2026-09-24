import { z } from "zod";
import { isValidDate } from "@/lib/dates";
import { optionalText } from "./fields";

const slot = z.enum(["breakfast", "lunch", "dinner"]);
const dateString = z.string().refine((v) => isValidDate(v), "Enter a valid date");

/** The whole grid for one building and one date: who is on the grid, and which meals are OFF. */
export const mealDaySchema = z.object({
  buildingId: z.uuid(),
  date: dateString,
  studentIds: z.array(z.uuid()).max(1000),
  offs: z.array(z.object({ studentId: z.uuid(), slot })).max(3000),
});
export type MealDayInput = z.infer<typeof mealDaySchema>;

export const holidaySchema = z
  .object({
    buildingId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.uuid().nullable()),
    from: dateString,
    to: dateString,
    slots: z.array(slot).min(1, "Tick at least one meal"),
    note: optionalText(200),
  })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "End date must be on or after the start date" });
export type HolidayInput = z.infer<typeof holidaySchema>;

export const holidayIdSchema = z.object({ holidayId: z.uuid() });

/** Admin setting: until when (the night before) students can change their own meals. "" = office only. */
export const mealCutoffSchema = z.object({
  cutoffHour: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(0).max(23).nullable()),
});

/** A student turning their own meals on or off for one day or a range of days. */
export const myMealsSchema = z
  .object({
    from: dateString,
    to: dateString,
    slots: z.array(slot).min(1, "Tick at least one meal"),
    on: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "End date must be on or after the start date" });
export type MyMealsInput = z.infer<typeof myMealsSchema>;
