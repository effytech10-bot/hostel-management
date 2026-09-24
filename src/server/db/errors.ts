/** Postgres error codes we turn into friendly messages. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

/** True when a database error (possibly wrapped by Drizzle) has the given Postgres code. */
export function isPgError(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code: unknown }).code === code
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : null;
  }
  return false;
}
