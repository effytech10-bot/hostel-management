/**
 * Money helpers.
 *
 * RULE: every amount in this app is an integer number of PAISA (1 taka = 100 paisa).
 * Never store or add taka as floating point numbers.
 *   ৳8,000     -> 800000
 *   ৳27.50     -> 2750
 */
export type Paisa = number;

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

function toAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
}

export function isPaisa(value: unknown): value is Paisa {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertPaisa(value: number, label = "amount"): asserts value is Paisa {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer number of paisa, got ${value}`);
  }
}

/**
 * Parse a taka amount typed by a person into paisa.
 * Accepts "8000", "8,000", "1,02,668.5", "৳ 27.50", "৮০০০", "-65".
 * Throws on anything else (more than 2 decimals, letters, empty).
 */
export function parseTaka(input: string | number): Paisa {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Invalid amount");
    return parseTaka(input.toFixed(2));
  }
  const cleaned = toAsciiDigits(input)
    .replace(/৳|tk\.?|taka/gi, "")
    .replace(/[,\s]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new Error(`Invalid amount: "${input}"`);
  const [, sign, whole, fraction = ""] = match;
  const paisa = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paisa)) throw new Error("Amount too large");
  return sign ? -paisa : paisa;
}

/** Same as parseTaka but returns null instead of throwing. */
export function tryParseTaka(input: string | number): Paisa | null {
  try {
    return parseTaka(input);
  } catch {
    return null;
  }
}

const groupFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Format paisa for display using Bangladeshi grouping.
 *   formatTaka(10266800) -> "৳1,02,668"
 *   formatTaka(2750)     -> "৳27.50"
 *   formatTaka(-6500)    -> "-৳65"
 */
export function formatTaka(paisa: Paisa, options: { symbol?: boolean; alwaysDecimals?: boolean } = {}): string {
  assertPaisa(paisa);
  const { symbol = true, alwaysDecimals = false } = options;
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  let text = groupFormatter.format(whole);
  if (fraction !== 0 || alwaysDecimals) text += "." + String(fraction).padStart(2, "0");
  return `${negative ? "-" : ""}${symbol ? "৳" : ""}${text}`;
}

/** Sum paisa values safely. */
export function sumPaisa(values: readonly Paisa[]): Paisa {
  let total = 0;
  for (const v of values) {
    assertPaisa(v);
    total += v;
  }
  assertPaisa(total, "total");
  return total;
}

/** rate × quantity, where quantity is a whole count (e.g. 30 lunches). */
export function multiplyPaisa(rate: Paisa, quantity: number): Paisa {
  assertPaisa(rate, "rate");
  if (!Number.isSafeInteger(quantity)) throw new Error(`quantity must be a whole number, got ${quantity}`);
  const result = rate * quantity;
  assertPaisa(result, "result");
  return result;
}
