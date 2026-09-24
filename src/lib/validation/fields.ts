import { z } from "zod";
import { dhakaDate, isValidDate } from "@/lib/dates";
import { tryParseTaka } from "@/lib/money";
import { normalizeBdPhone } from "@/lib/phone";

/** Text box that may be left empty: "" becomes null. */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : null));

/** Taka amount typed by a person ("6,000", "27.50"); empty becomes null. Result is paisa. */
export const optionalTaka = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const paisa = tryParseTaka(v);
      if (paisa === null || paisa < 0) {
        ctx.addIssue({ code: "custom", message: "Enter an amount in taka, e.g. 6000 or 27.50" });
        return z.NEVER;
      }
      return paisa;
    });

/** Bangladeshi mobile number that may be left empty. */
export const optionalPhone = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const phone = normalizeBdPhone(v);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Enter a valid mobile number (01XXXXXXXXX)" });
        return z.NEVER;
      }
      return phone;
    });

/** Whole number that may be left empty. */
export const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `Enter a whole number from ${min} to ${max}` });
        return z.NEVER;
      }
      return n;
    });

/** Checkbox / hidden "true" | "false". */
export const booleanField = () => z.enum(["true", "false"]).transform((v) => v === "true");

/** Required taka amount (0 allowed). Result is paisa. */
export const requiredTaka = (label = "amount") =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .transform((v, ctx) => {
      const paisa = tryParseTaka(v);
      if (paisa === null || paisa < 0) {
        ctx.addIssue({ code: "custom", message: "Enter an amount in taka, e.g. 8000" });
        return z.NEVER;
      }
      return paisa;
    });

/** Required Bangladeshi mobile number. */
export const requiredPhone = () =>
  z
    .string()
    .trim()
    .min(1, "Enter a mobile number")
    .transform((v, ctx) => {
      const phone = normalizeBdPhone(v);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Enter a valid mobile number (01XXXXXXXXX)" });
        return z.NEVER;
      }
      return phone;
    });

/** Calendar date "YYYY-MM-DD"; empty means today in Dhaka. */
export const dateField = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return dhakaDate();
      if (!isValidDate(v)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date" });
        return z.NEVER;
      }
      return v;
    });
