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
  it("any day of the month: that month's token, full rent, advance + service charge", () => {
    for (const day of ["2026-11-01", "2026-11-15", "2026-11-28"]) {
      const t = admissionDrafts({
        admissionDate: day,
        rentPaisa: 600000,
        mealDepositPaisa: 420000,
        advanceMonths: 2,
        serviceChargePaisa: 600000,
      });
      expect(t.period).toBe("2026-11");
      expect(t.lines.map((l) => [l.section, l.label, l.detail, l.amountPaisa])).toEqual([
        ["current", "Month rent", "Nov 2026", 600000],
        ["current", "Meal deposit", "Nov 2026", 420000],
        ["due", "Advance", "2 months rent", 1200000],
        ["due", "Service charge", "One time", 600000],
      ]);
      expect(totalOf(t.lines)).toBe(2820000);
    }
  });
  it("no service charge line when it is 0", () => {
    const t = admissionDrafts({
      admissionDate: "2026-10-20",
      rentPaisa: 600000,
      mealDepositPaisa: 420000,
      advanceMonths: 2,
      serviceChargePaisa: 0,
    });
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
