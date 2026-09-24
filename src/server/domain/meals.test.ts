import { describe, expect, it } from "vitest";
import {
  buildingOnDate,
  countMeals,
  defaultOn,
  mealIsOn,
  formatMealUnits,
  firstStudentMealDate,
  formatHour,
  mealDateEditError,
  mealKey,
  shiftDate,
  studentMealDeadline,
  type SeatInterval,
} from "./meals";

const none = new Set<string>();
const noBuildingHolidays = new Map<string, Set<string>>();

describe("countMeals", () => {
  it("counts every meal of a full month by default", () => {
    const c = countMeals({
      period: "2026-09",
      intervals: [{ start: "2026-01-01", end: null, buildingId: "B207" }],
      offs: none,
      holidaysAll: none,
      holidaysByBuilding: noBuildingHolidays,
    });
    expect(c).toEqual({ breakfast: 30, lunch: 30, dinner: 30, days: 30, halfUnits: 30 + 60 + 60 });
    expect(formatMealUnits(c.halfUnits)).toBe("75");
  });

  it("starts on the admission day and skips OFF meals", () => {
    const offs = new Set([
      mealKey("2026-09-20", "lunch"),
      mealKey("2026-09-20", "dinner"),
      mealKey("2026-09-21", "breakfast"),
    ]);
    const c = countMeals({
      period: "2026-09",
      intervals: [{ start: "2026-09-16", end: null, buildingId: "B207" }],
      offs,
      holidaysAll: none,
      holidaysByBuilding: noBuildingHolidays,
    });
    // 15 days (16th-30th), minus 2 lunch/dinner and 1 breakfast
    expect(c).toMatchObject({ days: 15, breakfast: 14, lunch: 14, dinner: 14 });
    expect(formatMealUnits(c.halfUnits)).toBe("35");
  });

  it("applies holidays for all buildings and for the student's building on that day", () => {
    const intervals: SeatInterval[] = [
      { start: "2026-09-01", end: "2026-09-15", buildingId: "B178" },
      { start: "2026-09-15", end: null, buildingId: "B207" },
    ];
    const c = countMeals({
      period: "2026-09",
      intervals,
      offs: none,
      holidaysAll: new Set([mealKey("2026-09-10", "dinner")]),
      holidaysByBuilding: new Map([
        ["B178", new Set([mealKey("2026-09-12", "lunch"), mealKey("2026-09-20", "lunch")])], // 20th: not in 178 any more
        ["B207", new Set([mealKey("2026-09-20", "breakfast")])],
      ]),
    });
    expect(c).toMatchObject({ days: 30, breakfast: 29, lunch: 29, dinner: 29 });
  });

  it("stops at the leaving date", () => {
    const c = countMeals({
      period: "2026-09",
      intervals: [{ start: "2026-08-01", end: null, buildingId: "B" }],
      offs: none,
      holidaysAll: none,
      holidaysByBuilding: noBuildingHolidays,
      until: "2026-09-10",
    });
    expect(c.days).toBe(10);
  });

  it("counts half units correctly for breakfast-only days", () => {
    expect(formatMealUnits(5)).toBe("2.5");
  });
});

describe("helpers", () => {
  it("finds the building for a date with end-exclusive intervals", () => {
    const intervals: SeatInterval[] = [
      { start: "2026-09-01", end: "2026-09-15", buildingId: "A" },
      { start: "2026-09-15", end: null, buildingId: "B" },
    ];
    expect(buildingOnDate(intervals, "2026-09-14")).toBe("A");
    expect(buildingOnDate(intervals, "2026-09-15")).toBe("B");
    expect(buildingOnDate(intervals, "2026-08-31")).toBeNull();
  });

  it("limits which dates can be edited", () => {
    expect(mealDateEditError("2026-09-23", "2026-09-23")).toBeNull();
    expect(mealDateEditError("2026-08-01", "2026-09-23")).toBeNull();
    expect(mealDateEditError("2026-07-31", "2026-09-23")).toMatch(/no longer/);
    expect(mealDateEditError("2026-10-24", "2026-09-23")).toBeNull();
    expect(mealDateEditError("2026-10-25", "2026-09-23")).toMatch(/31 days/);
  });

  it("shifts dates across months", () => {
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("student meal deadline", () => {
  it("is the cutoff hour (hostel time) on the day before", () => {
    expect(studentMealDeadline("2026-09-25", 22).toISOString()).toBe("2026-09-24T16:00:00.000Z");
    expect(studentMealDeadline("2026-10-01", 20).toISOString()).toBe("2026-09-30T14:00:00.000Z");
    expect(studentMealDeadline("2027-01-01", 23).toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  it("gives tomorrow before the cutoff and the day after once it has passed", () => {
    // 9:59 PM in Dhaka on the 24th
    expect(firstStudentMealDate(new Date("2026-09-24T15:59:00Z"), 22, "2026-09-24")).toBe("2026-09-25");
    // 10:00 PM exactly: too late for the 25th
    expect(firstStudentMealDate(new Date("2026-09-24T16:00:00Z"), 22, "2026-09-24")).toBe("2026-09-26");
    // Just after midnight on the 25th (still the 24th in UTC)
    expect(firstStudentMealDate(new Date("2026-09-24T18:30:00Z"), 22, "2026-09-25")).toBe("2026-09-26");
    // Month end
    expect(firstStudentMealDate(new Date("2026-09-30T12:00:00Z"), 21, "2026-09-30")).toBe("2026-10-01");
  });

  it("formats hours", () => {
    expect(formatHour(22)).toBe("10 PM");
    expect(formatHour(18)).toBe("6 PM");
    expect(formatHour(0)).toBe("12 AM");
    expect(formatHour(12)).toBe("12 PM");
  });
});

describe("normal meal settings (breakfast off every day)", () => {
  const defaults = [
    { slot: "breakfast" as const, fromDate: "2026-10-05", isOn: false },
    { slot: "breakfast" as const, fromDate: "2026-10-20", isOn: true },
  ];
  it("latest setting on or before the date wins", () => {
    expect(defaultOn(defaults, "breakfast", "2026-10-04")).toBe(true);
    expect(defaultOn(defaults, "breakfast", "2026-10-05")).toBe(false);
    expect(defaultOn(defaults, "breakfast", "2026-10-19")).toBe(false);
    expect(defaultOn(defaults, "breakfast", "2026-10-20")).toBe(true);
    expect(defaultOn(defaults, "lunch", "2026-10-10")).toBe(true);
    expect(defaultOn(undefined, "breakfast", "2026-10-10")).toBe(true);
  });
  it("counts with exceptions on top", () => {
    const intervals = [{ start: "2026-10-01", end: null, buildingId: "b" }];
    const c = countMeals({
      period: "2026-10",
      intervals,
      offs: new Set([mealKey("2026-10-02", "breakfast"), mealKey("2026-10-10", "lunch")]),
      ons: new Set([mealKey("2026-10-12", "breakfast")]),
      defaults,
      holidaysAll: new Set([mealKey("2026-10-13", "breakfast")]),
      holidaysByBuilding: new Map(),
    });
    // Breakfast: days 1,3,4 (4 days before the 5th minus the 2nd off) + 12th (ON exception) + 20..31 (12) = 16
    expect(c.breakfast).toBe(16);
    expect(c.lunch).toBe(30);
    expect(c.dinner).toBe(31);
  });
  it("mealIsOn order", () => {
    expect(mealIsOn({ holiday: true, off: false, on: true, normallyOn: true })).toBe(false);
    expect(mealIsOn({ holiday: false, off: false, on: true, normallyOn: false })).toBe(true);
    expect(mealIsOn({ holiday: false, off: true, on: false, normallyOn: true })).toBe(false);
    expect(mealIsOn({ holiday: false, off: false, on: false, normallyOn: false })).toBe(false);
  });
});
