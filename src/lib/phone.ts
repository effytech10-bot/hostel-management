/**
 * Bangladeshi mobile numbers are stored in one canonical form: "01XXXXXXXXX" (11 digits).
 * Accepts "+8801712345678", "8801712345678", "01712-345678", "০১৭১২৩৪৫৬৭৮".
 */
const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export function normalizeBdPhone(input: string): string | null {
  const digits = input
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/[\s\-().]/g, "")
    .replace(/^\+/, "");
  let local = digits;
  if (local.startsWith("880")) local = "0" + local.slice(3);
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

export function isBdPhone(input: string): boolean {
  return normalizeBdPhone(input) !== null;
}
