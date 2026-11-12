import { describe, expect, it } from "vitest";
import { parseTaka as tk } from "@/lib/money";
import { chargedIncome, FUND_LABEL } from "./finance";
import { cashSteps, incomeLines, sumLines } from "./income-statement";

const month = [
  { head: "rent" as const, sourceType: "token", amountPaisa: tk("80000") },
  { head: "rent" as const, sourceType: "admission", amountPaisa: tk("8000") },
  { head: "rent" as const, sourceType: "leave", amountPaisa: -tk("2935") },
  { head: "rent" as const, sourceType: "payment", amountPaisa: -tk("50000") },
  { head: "advance" as const, sourceType: "admission", amountPaisa: tk("16000") },
  { head: "meal" as const, sourceType: "token", amountPaisa: tk("4200") },
  { head: "meal" as const, sourceType: "adjustment", amountPaisa: -tk("100") },
  { head: "service_charge" as const, sourceType: "admission", amountPaisa: tk("6000") },
  { head: "other" as const, sourceType: "adjustment", amountPaisa: tk("50") },
];

describe("income statement lines", () => {
  const meals = { monthPaisa: tk("19800"), allPaisa: tk("50000"), meals: 432 };
  const lines = incomeLines(month, month, meals);

  it("add up to the same income as the finance overview", () => {
    const income = chargedIncome(month);
    income.meal += meals.monthPaisa;
    expect(sumLines(lines.rent).monthPaisa).toBe(income.rent);
    expect(sumLines(lines.meal).monthPaisa).toBe(income.meal);
    expect(sumLines(lines.service).monthPaisa).toBe(income.service);
  });

  it("names every line in plain words; advance and payments are not income", () => {
    expect(lines.rent.map((l) => [l.label, l.monthPaisa])).toEqual([
      ["Rent of the month", tk("88000")],
      ["Rent given back", -tk("2935")],
    ]);
    expect(lines.meal.map((l) => l.label)).toEqual(["Meals eaten", "Admin changes to meal bills"]);
    expect(lines.service.map((l) => l.label)).toEqual(["Service charge", "Other charges added by admin"]);
  });
});

describe("cash steps", () => {
  it("start, movements with the other account named, end", () => {
    const steps = cashSteps({
      openingPaisa: tk("1000"),
      studentInPaisa: tk("500"),
      movedPaisa: -tk("200"),
      movedWith: { meal: -tk("200") },
      refundedPaisa: 0,
      ownerInPaisa: 0,
      ownerOutPaisa: tk("100"),
      expensePaisa: tk("300"),
      closingPaisa: tk("900"),
      fundLabel: (f) => FUND_LABEL[f],
    });
    expect(steps.map((s) => [s.label, s.amountPaisa, s.kind])).toEqual([
      ["At the start of the month", tk("1000"), "start"],
      ["Students paid", tk("500"), "in"],
      ["To Meal account", -tk("200"), "out"],
      ["Expenses", -tk("300"), "out"],
      ["Owner took out", -tk("100"), "out"],
      ["At the end", tk("900"), "end"],
    ]);
  });
});
