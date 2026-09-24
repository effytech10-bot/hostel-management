/**
 * Pure helpers for setting up rooms and seats. No database, no framework: easy to test.
 */

export const MAX_ROOMS_PER_BATCH = 100;
export const MAX_SEATS_PER_ROOM = 12;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** "601" -> 6, "1020" -> 10, "205" -> 2. Anything else ("G-2", "12") -> null. */
export function floorFromRoomNumber(roomNumber: string): number | null {
  const trimmed = roomNumber.trim();
  if (!/^\d{3,4}$/.test(trimmed)) return null;
  return Math.floor(Number(trimmed) / 100);
}

/**
 * Room numbers from `from` to `to` inclusive, e.g. ("601", "605") -> ["601", ..., "605"].
 * Throws a readable error for bad input.
 */
export function expandRoomRange(from: string, to: string): string[] {
  const a = from.trim();
  const b = to.trim();
  if (!/^\d{1,5}$/.test(a) || !/^\d{1,5}$/.test(b)) {
    throw new Error("Room numbers in a range must be digits only, e.g. 601 to 615.");
  }
  const start = Number(a);
  const end = Number(b);
  if (end < start) throw new Error("The last room number must be greater than or equal to the first.");
  const count = end - start + 1;
  if (count > MAX_ROOMS_PER_BATCH) {
    throw new Error(`At most ${MAX_ROOMS_PER_BATCH} rooms at a time (you asked for ${count}).`);
  }
  return Array.from({ length: count }, (_, i) => String(start + i));
}

/**
 * Seat labels from what the admin typed:
 *   "2"      -> ["A", "B"]
 *   "a, b,c" -> ["A", "B", "C"]
 *   "1,2"    -> ["1", "2"]
 */
export function parseSeatLabels(input: string): string[] {
  const trimmed = input.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    const count = Number(trimmed);
    if (count < 1 || count > MAX_SEATS_PER_ROOM) {
      throw new Error(`Seats per room must be between 1 and ${MAX_SEATS_PER_ROOM}.`);
    }
    return LETTERS.slice(0, count).split("");
  }
  const labels = trimmed
    .split(/[,\s]+/)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);
  if (labels.length === 0) throw new Error('Enter a seat count (e.g. 2) or labels (e.g. "A,B").');
  if (labels.length > MAX_SEATS_PER_ROOM) throw new Error(`At most ${MAX_SEATS_PER_ROOM} seats per room.`);
  if (labels.some((l) => !/^[A-Z0-9]{1,4}$/.test(l))) {
    throw new Error("Seat labels can only contain letters or digits (up to 4 characters).");
  }
  if (new Set(labels).size !== labels.length) throw new Error("Seat labels must not repeat.");
  return labels;
}

/** Next free letter for a room: ["A", "B"] -> "C". Falls back to numbers after Z. */
export function nextSeatLabel(existing: readonly string[]): string {
  const used = new Set(existing.map((l) => l.toUpperCase()));
  for (const letter of LETTERS) if (!used.has(letter)) return letter;
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

/** Sort room numbers naturally: "205" < "601" < "1020" < "G-2". */
export function compareRoomNumbers(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}
