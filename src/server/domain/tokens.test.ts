import { describe, expect, it } from "vitest";
import { admissionDrafts, dayRange, dueLines, mealCutoff, tokenCode, tokenState, totalOf } from "./tokens";

describe("token code", () => {
  it("is year+month, building+room+seat, last 3 of the Student ID", () => {
    expect(
      tokenCode({ period: "2026-10", buildingCode: "207", roomNumber: "601", seatLabel: "A", studentCode: "10001" }),
    ).toBe("2610-207601A-001");
    expect(
      tokenCode({ period: "2027-01", buildingCode: "177/1", roomNumber: "2-B", seatLabel: "c", studentCode: "11234" }),
    ).toBe("2701-17712BC-234");
  });
});

describe("dates", () => {
  it("day ranges", () => {
    expect(dayRange("2026-09-25", "2026-09-30")).toBe("25 – 30 Sep");
    expect(dayRange("2026-09-25", "2026-10-31")).toBe("25 Sep – 31 Oct");
    expect(dayRange("2026-11-20", "2026-11-20")).toBe("20 Nov");
  });
  it("meal cut-off: 1st = end of last month, early = that day", () => {
    expect(mealCutoff("2026-11", "2026-11-01")).toBe("2026-10-31");
    expect(mealCutoff("2026-12", "2026-11-20")).toBe("2026-11-20");
    expect(mealCutoff("2027-03", "2027-03-01")).toBe("2027-02-28");
  });
});

describe("admission token", () => {
  it("25 Sep: October token with the rest of September as due", () => {
    const t = admissionDrafts({
      admissionDate: "2026-09-25",
      rentPaisa: 600000,
      restOfMonthMealsPaisa: 6 * 13750,
      mealDepositPaisa: 420000,
      advanceMonths: 2,
      serviceChargePaisa: 600000,
      rule: "prorata",
    });
    expect(t.period).toBe("2026-10");
    expect(t.restDays).toBe(6);
    expect(t.lines.map((l) => [l.section, l.label, l.detail, l.amountPaisa])).toEqual([
      ["current", "Month rent", "Oct 2026", 600000],
      ["current", "Meal deposit", "Oct 2026", 420000],
      ["due", "Monthly due", "25 – 30 Sep", 120000],
      ["due", "Pre meal", "25 – 30 Sep", 82500],
      ["due", "Advance", "2 months rent", 1200000],
      ["due", "Service charge", "One time", 600000],
    ]);
    expect(totalOf(t.lines)).toBe(600000 + 420000 + 120000 + 82500 + 1200000 + 600000);
  });
  it("1 Oct: the whole of October is due and the token is for November", () => {
    const t = admissionDrafts({
      admissionDate: "2026-10-01",
      rentPaisa: 600000,
      restOfMonthMealsPaisa: 0,
      mealDepositPaisa: 420000,
      advanceMonths: 2,
      serviceChargePaisa: 0,
      rule: "prorata",
    });
    expect(t.period).toBe("2026-11");
    expect(t.lines.find((l) => l.label === "Monthly due")).toMatchObject({ detail: "1 – 31 Oct", amountPaisa: 600000 });
    expect(t.lines.some((l) => l.head === "service_charge")).toBe(false);
  });
});

describe("due lines and state", () => {
  it("labels and order", () => {
    const lines = dueLines({ credit: -5000, meal: -105000, rent: 200000, advance: 100 }, { meal: "1 – 20 Nov" });
    expect(lines.map((l) => [l.label, l.detail, l.amountPaisa])).toEqual([
      ["Monthly due", null, 200000],
      ["Pre meal", "1 – 20 Nov", -105000],
      ["Advance due", null, 100],
      ["Extra paid", null, -5000],
    ]);
  });
  it("older tokens are paid or carried", () => {
    expect(tokenState({ isLatest: true, remainingPaisa: 0, paidPaisa: 5 })).toBe("paid");
    expect(tokenState({ isLatest: true, remainingPaisa: 5, paidPaisa: 5 })).toBe("partial");
    expect(tokenState({ isLatest: true, remainingPaisa: 5, paidPaisa: 0 })).toBe("unpaid");
    expect(tokenState({ isLatest: false, remainingPaisa: 5, paidPaisa: 0 })).toBe("carried");
  });
});
