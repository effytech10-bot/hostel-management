import { describe, expect, it } from "vitest";
import { parseTaka as tk } from "@/lib/money";
import { admissionLines, daysFrom, prorate, unusedDaysCredit } from "./stay";

const rates = { mealDepositPaisa: tk("4200"), baburchiPaisa: tk("400"), advanceMonths: 2 };

describe("prorate", () => {
  it("charges by days, rounded to taka", () => {
    expect(prorate(tk("6000"), 10, 30)).toBe(tk("2000"));
    expect(prorate(tk("7600"), 11, 31)).toBe(tk("2697")); // 2696.77 → 2697
    expect(prorate(tk("6000"), 30, 30)).toBe(tk("6000"));
    expect(prorate(tk("6000"), 0, 30)).toBe(0);
  });
  it("counts the joining day", () => {
    expect(daysFrom("2026-09-21")).toBe(10);
    expect(daysFrom("2026-09-01")).toBe(30);
    expect(daysFrom("2026-02-28")).toBe(1);
  });
});

describe("admission bill", () => {
  it("joining on the 1st: advance + full month", () => {
    const r = admissionLines({ admissionDate: "2026-09-01", rentPaisa: tk("6000"), rates, rule: "prorata" });
    expect(r.lines.map((l) => [l.label, l.amountPaisa / 100])).toEqual([
      ["Advance (2 months rent)", 12000],
      ["Rent", 6000],
      ["Meal deposit", 4200],
      ["Baburchi bill", 400],
    ]);
  });
  it("joining on the 21st with the by-days rule", () => {
    const r = admissionLines({ admissionDate: "2026-09-21", rentPaisa: tk("6000"), rates, rule: "prorata" });
    expect(r.lines.map((l) => l.amountPaisa / 100)).toEqual([12000, 2000, 1400, 133]);
    expect(r.lines[1].label).toBe("Rent (10 of 30 days)");
  });
  it("joining on the 21st with the full-month rule", () => {
    const r = admissionLines({ admissionDate: "2026-09-21", rentPaisa: tk("6000"), rates, rule: "full" });
    expect(r.lines.map((l) => l.amountPaisa / 100)).toEqual([12000, 6000, 4200, 400]);
  });
  it("leaves out zero lines (no rent, no baburchi)", () => {
    const r = admissionLines({
      admissionDate: "2026-09-01",
      rentPaisa: 0,
      rates: { ...rates, baburchiPaisa: 0 },
      rule: "full",
    });
    expect(r.lines.map((l) => l.head)).toEqual(["meal"]);
  });
});

describe("leaving mid-month", () => {
  it("gives back unused days of rent and baburchi (by-days rule)", () => {
    expect(
      unusedDaysCredit({
        lastDay: "2026-09-20",
        chargedRentPaisa: tk("6000"),
        chargedBaburchiPaisa: tk("400"),
        rule: "prorata",
      }),
    ).toEqual({
      rentPaisa: tk("2000"),
      baburchiPaisa: tk("133"),
      unusedDays: 10,
    });
  });
  it("gives nothing back with the full-month rule or on the last day", () => {
    expect(
      unusedDaysCredit({ lastDay: "2026-09-20", chargedRentPaisa: tk("6000"), chargedBaburchiPaisa: 0, rule: "full" })
        .rentPaisa,
    ).toBe(0);
    expect(
      unusedDaysCredit({
        lastDay: "2026-09-30",
        chargedRentPaisa: tk("6000"),
        chargedBaburchiPaisa: 0,
        rule: "prorata",
      }).rentPaisa,
    ).toBe(0);
  });
});
