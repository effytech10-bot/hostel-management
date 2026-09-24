import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentPeriod,
  datesInPeriod,
  daysInPeriod,
  dhakaDate,
  formatPeriod,
  isValidDate,
  isValidPeriod,
  nextPeriod,
  periodEnd,
  periodOf,
  periodStart,
  previousPeriod,
} from "./dates";

describe("Dhaka calendar", () => {
  it("uses Asia/Dhaka (UTC+6) for the calendar date", () => {
    // 2026-09-30 18:30 UTC is already 1 October 00:30 in Dhaka
    const instant = new Date("2026-09-30T18:30:00Z");
    expect(dhakaDate(instant)).toBe("2026-10-01");
    expect(currentPeriod(instant)).toBe("2026-10");
    // 17:59 UTC is still 30 September 23:59 in Dhaka
    expect(dhakaDate(new Date("2026-09-30T17:59:00Z"))).toBe("2026-09-30");
  });
});

describe("periods", () => {
  it("validates periods and dates", () => {
    expect(isValidPeriod("2026-10")).toBe(true);
    expect(isValidPeriod("2026-13")).toBe(false);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
  });

  it("computes bounds and lengths", () => {
    expect(periodStart("2026-09")).toBe("2026-09-01");
    expect(periodEnd("2026-09")).toBe("2026-09-30");
    expect(daysInPeriod("2026-02")).toBe(28);
    expect(datesInPeriod("2026-02")).toHaveLength(28);
    expect(periodOf("2026-10-15")).toBe("2026-10");
  });

  it("moves across years", () => {
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(previousPeriod("2027-01")).toBe("2026-12");
    expect(addMonths("2026-10", -13)).toBe("2025-09");
  });

  it("formats for humans", () => {
    expect(formatPeriod("2026-10")).toBe("October 2026");
  });
});
