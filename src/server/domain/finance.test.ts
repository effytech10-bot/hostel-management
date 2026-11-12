import { describe, expect, it } from "vitest";
import { parseTaka as tk } from "@/lib/money";
import type { Due } from "./billing";
import {
  allocateByFund,
  buildFlow,
  byFund,
  chargedIncome,
  fundDues,
  headOrder,
  nettingOtherFund,
  parseFundOrder,
  rebalanceParts,
  receiptBoxes,
  splitPayment,
  sumFunds,
  type FundMovement,
} from "./finance";

const dues: Due[] = [
  { head: "meal", period: "2026-11", amountPaisa: tk("500") },
  { head: "rent", period: "2026-11", amountPaisa: tk("500") },
  { head: "service_charge", period: "2026-11", amountPaisa: tk("500") },
];

describe("splitting a payment over the three accounts", () => {
  it("the owner's example: 1,200 against 500 + 500 + 500 fills rent, meal, then service", () => {
    expect(splitPayment(tk("1200"), fundDues(dues), ["rent", "meal", "service"])).toEqual({
      rent: tk("500"),
      meal: tk("500"),
      service: tk("200"),
    });
  });

  it("follows the order chosen in Settings", () => {
    expect(splitPayment(tk("1200"), fundDues(dues), parseFundOrder("meal,service,rent"))).toEqual({
      rent: tk("200"),
      meal: tk("500"),
      service: tk("500"),
    });
  });

  it("money beyond all dues goes to the meal account (kept as meal deposit)", () => {
    const parts = splitPayment(tk("2000"), fundDues(dues), ["rent", "meal", "service"]);
    expect(parts).toEqual({ rent: tk("500"), meal: tk("1000"), service: tk("500") });
    expect(sumFunds(parts)).toBe(tk("2000"));
  });

  describe("the cashier changes one account; the total stays", () => {
    // Anan's November token: rent 50,000, meal 12,375, service 5,200 due.
    const due = { rent: tk("50000"), meal: tk("12375"), service: tk("5200") };
    const order = ["rent", "meal", "service"] as const;
    const start = splitPayment(tk("60000"), due, order);

    it("lowering rent fills meal, then service", () => {
      expect(start).toEqual({ rent: tk("50000"), meal: tk("10000"), service: 0 });
      const r = rebalanceParts(tk("60000"), { ...start, rent: tk("40000") }, due, order, "rent");
      expect(r).toEqual({ parts: { rent: tk("40000"), meal: tk("14800"), service: tk("5200") }, unplacedPaisa: 0 });
    });

    it("what is left after all dues goes to meal", () => {
      const r = rebalanceParts(tk("67575"), { rent: tk("30000"), meal: 0, service: 0 }, due, order, "rent");
      expect(r.parts).toEqual({ rent: tk("30000"), meal: tk("32375"), service: tk("5200") });
      expect(r.unplacedPaisa).toBe(0);
      expect(sumFunds(r.parts)).toBe(tk("67575"));
    });

    it("lowering meal fills service; the rest goes back to meal only if it is not the changed box", () => {
      const r = rebalanceParts(tk("67575"), { rent: tk("50000"), meal: tk("5000"), service: 0 }, due, order, "meal");
      expect(r.parts).toEqual({ rent: tk("50000"), meal: tk("5000"), service: tk("5200") });
      expect(r.unplacedPaisa).toBe(tk("7375"));
    });

    it("lowering service sends the rest to meal", () => {
      const r = rebalanceParts(
        tk("67575"),
        { rent: tk("50000"), meal: tk("12375"), service: tk("1000") },
        due,
        order,
        "service",
      );
      expect(r.parts).toEqual({ rent: tk("50000"), meal: tk("16575"), service: tk("1000") });
      expect(r.unplacedPaisa).toBe(0);
    });

    it("more than the total empties the later boxes and reports it", () => {
      const r = rebalanceParts(tk("60000"), { ...start, rent: tk("65000") }, due, order, "rent");
      expect(r.parts).toEqual({ rent: tk("65000"), meal: 0, service: 0 });
      expect(r.unplacedPaisa).toBe(-tk("5000"));
    });
  });

  it("advance counts as rent account, other charges as service account", () => {
    expect(
      fundDues([
        { head: "advance", period: "2026-10", amountPaisa: tk("16000") },
        { head: "rent", period: "2026-11", amountPaisa: tk("8000") },
        { head: "other", period: "2026-11", amountPaisa: tk("50") },
      ]),
    ).toEqual({ rent: tk("24000"), meal: 0, service: tk("50") });
  });

  it("an unknown order falls back to rent, meal, service", () => {
    expect(parseFundOrder("nonsense")).toEqual(["rent", "meal", "service"]);
    expect(headOrder(["meal", "rent", "service"])).toEqual([
      "meal",
      "baburchi",
      "rent",
      "advance",
      "service_charge",
      "other",
    ]);
  });
});

describe("posting the three parts to the ledger", () => {
  it("the admin's own split (400 / 500 / 300) is posted exactly as typed", () => {
    const rows = allocateByFund(dues, { meal: tk("400"), rent: tk("500"), service: tk("300") }, "2026-11");
    expect(byFund(rows)).toEqual({ meal: tk("400"), rent: tk("500"), service: tk("300") });
  });

  it("pays the oldest month first inside an account, rent before advance in the same month", () => {
    const rows = allocateByFund(
      [
        { head: "advance", period: "2026-10", amountPaisa: tk("1000") },
        { head: "rent", period: "2026-10", amountPaisa: tk("300") },
        { head: "rent", period: "2026-11", amountPaisa: tk("800") },
      ],
      { rent: tk("1500"), meal: 0, service: 0 },
      "2026-11",
    );
    expect(rows).toEqual([
      { head: "rent", period: "2026-10", amountPaisa: tk("300") },
      { head: "advance", period: "2026-10", amountPaisa: tk("1000") },
      { head: "rent", period: "2026-11", amountPaisa: tk("200") },
    ]);
  });

  it("money beyond an account's dues stays on that account as credit", () => {
    const rows = allocateByFund(dues, { rent: tk("700"), meal: tk("600"), service: 0 }, "2026-12");
    expect(rows).toContainEqual({ head: "credit", period: "2026-12", amountPaisa: tk("200") });
    expect(rows).toContainEqual({ head: "meal", period: "2026-12", amountPaisa: tk("100") });
    expect(rows.reduce((s, r) => s + r.amountPaisa, 0)).toBe(tk("1300"));
  });

  it("rejects a negative part", () => {
    expect(() => allocateByFund(dues, { rent: -1, meal: 0, service: 0 }, "2026-11")).toThrow();
  });
});

describe("money receipt boxes", () => {
  it("rent (with extra paid), advance, meal and service are shown apart", () => {
    expect(
      receiptBoxes([
        { head: "rent", amountPaisa: tk("8000") },
        { head: "credit", amountPaisa: tk("200") },
        { head: "advance", amountPaisa: tk("16000") },
        { head: "meal", amountPaisa: tk("4200") },
        { head: "service_charge", amountPaisa: tk("6000") },
      ]),
    ).toEqual({ rentPaisa: tk("8200"), advancePaisa: tk("16000"), mealPaisa: tk("4200"), servicePaisa: tk("6000") });
  });
});

describe("income from charges", () => {
  it("advance and the meal deposit are not income; a leave gives rent back", () => {
    expect(
      chargedIncome([
        { head: "rent", sourceType: "token", amountPaisa: tk("8000") },
        { head: "rent", sourceType: "leave", amountPaisa: -tk("2000") },
        { head: "advance", sourceType: "admission", amountPaisa: tk("16000") },
        { head: "meal", sourceType: "token", amountPaisa: tk("4200") },
        { head: "meal", sourceType: "adjustment", amountPaisa: -tk("100") },
        { head: "service_charge", sourceType: "admission", amountPaisa: tk("6000") },
        { head: "rent", sourceType: "payment", amountPaisa: -tk("8000") },
        { head: "rent", sourceType: "opening", amountPaisa: tk("999") },
      ]),
    ).toEqual({ rent: tk("6000"), meal: -tk("100"), service: tk("6000") });
  });
});

describe("credit moved between accounts", () => {
  it("names the other account from the ledger text", () => {
    expect(nettingOtherFund("Paid from credit")).toBe("rent");
    expect(nettingOtherFund("Used for meal")).toBe("meal");
    expect(nettingOtherFund("Advance returned")).toBeNull();
  });

  it("the picture names the accounts", () => {
    const flow = buildFlow([
      {
        fund: "rent",
        studentInPaisa: tk("1000"),
        movedPaisa: -tk("500"),
        movedWith: { meal: -tk("500") },
        refundedPaisa: 0,
        ownerInPaisa: 0,
        ownerOutPaisa: 0,
        expenses: [],
      },
      {
        fund: "meal",
        studentInPaisa: 0,
        movedPaisa: tk("500"),
        movedWith: { rent: tk("500") },
        refundedPaisa: 0,
        ownerInPaisa: 0,
        ownerOutPaisa: 0,
        expenses: [],
      },
    ]);
    expect(flow.left.find((n) => n.id === "from:rent")).toMatchObject({
      label: "From Rent & advance account",
      amountPaisa: tk("500"),
    });
    expect(flow.right.find((n) => n.id === "to:meal")).toMatchObject({
      label: "To Meal account",
      amountPaisa: tk("500"),
    });
    expect(flow.left.some((n) => n.id === "moved_in")).toBe(false);
  });
});

describe("money flow picture", () => {
  const movement = (m: Partial<FundMovement> & Pick<FundMovement, "fund">): FundMovement => ({
    studentInPaisa: 0,
    movedPaisa: 0,
    refundedPaisa: 0,
    ownerInPaisa: 0,
    ownerOutPaisa: 0,
    expenses: [],
    ...m,
  });

  it("each account's money in equals its money out", () => {
    const flow = buildFlow([
      movement({
        fund: "rent",
        studentInPaisa: tk("50000"),
        ownerOutPaisa: tk("10000"),
        expenses: [{ name: "House rent", amountPaisa: tk("30000") }],
      }),
      movement({
        fund: "meal",
        studentInPaisa: tk("20000"),
        movedPaisa: tk("1000"),
        expenses: [
          { name: "Bazar", amountPaisa: tk("24000") },
          { name: "Baburchi", amountPaisa: tk("3000") },
        ],
      }),
      movement({ fund: "service" }),
    ]);
    for (const f of flow.middle) {
      const into = flow.links.filter((l) => l.to === f.id).reduce((s, l) => s + l.amountPaisa, 0);
      const out = flow.links.filter((l) => l.from === f.id).reduce((s, l) => s + l.amountPaisa, 0);
      expect(into).toBe(out);
    }
    expect(flow.middle.map((n) => n.id)).toEqual(["fund:rent", "fund:meal"]);
    // Rent kept 10,000; meal spent 6,000 more than came in.
    expect(flow.right.find((n) => n.id === "kept")?.amountPaisa).toBe(tk("10000"));
    expect(flow.left.find((n) => n.id === "earlier")?.amountPaisa).toBe(tk("6000"));
    expect(flow.left.reduce((s, n) => s + n.amountPaisa, 0)).toBe(flow.right.reduce((s, n) => s + n.amountPaisa, 0));
  });

  it("small categories are grouped as Other expenses", () => {
    const flow = buildFlow(
      [
        movement({
          fund: "meal",
          studentInPaisa: tk("600"),
          expenses: ["A", "B", "C", "D"].map((name, i) => ({ name, amountPaisa: tk(String(100 + i)) })),
        }),
      ],
      3,
    );
    expect(flow.right.filter((n) => n.id.startsWith("cat:")).map((n) => n.label)).toEqual(["D", "C", "Other expenses"]);
  });
});
