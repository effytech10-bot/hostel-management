import { describe, expect, it } from "vitest";
import { parseTaka as tk } from "@/lib/money";
import {
  advanceAmount,
  allocatePayment,
  balancesByHead,
  buildToken,
  mealCost,
  mealSettlement,
  netCredits,
  openDues,
  tokenPaymentStatus,
  type LedgerLine,
  type Rates,
} from "./billing";

/** The client's rates from context.txt. */
const rates: Rates = {
  breakfastRatePaisa: tk("27.50"),
  lunchRatePaisa: tk("55"),
  dinnerRatePaisa: tk("55"),
  mealDepositPaisa: tk("3800"),
  baburchiPaisa: tk("400"),
  serviceChargePaisa: tk("6000"),
  serviceChargeThisMonth: false,
  advanceMonths: 2,
  midMonthRule: "prorata",
};

describe("meal cost and settlement (client's example, context.txt §11-13)", () => {
  it("prices meals exactly, breakfast at half rate", () => {
    expect(mealCost({ breakfast: 0, lunch: 30, dinner: 33 }, rates)).toBe(tk("3465")); // Salek 63 meals
    expect(mealCost({ breakfast: 1, lunch: 0, dinner: 0 }, rates)).toBe(tk("27.50"));
    expect(mealCost({ breakfast: 3, lunch: 1, dinner: 1 }, rates)).toBe(tk("192.50"));
  });

  it("Salek: 63 meals vs ৳3,800 deposit, plus baburchi ৳400 = owes ৳65", () => {
    const s = mealSettlement({ counts: { breakfast: 0, lunch: 30, dinner: 33 }, depositPaisa: tk("3800"), rates });
    expect(s.differencePaisa).toBe(-tk("335")); // meal credit
    expect(s.entry).toEqual({ debitPaisa: 0, creditPaisa: tk("335") });
    // Baburchi is billed once, separately: 400 − 335 = 65, the client's number.
    expect(rates.baburchiPaisa + s.differencePaisa).toBe(tk("65"));
  });

  it("Rahman: 82 meals vs ৳3,800 deposit, plus baburchi ৳400 = owes ৳1,110; both = ৳1,175", () => {
    const s = mealSettlement({ counts: { breakfast: 0, lunch: 41, dinner: 41 }, depositPaisa: tk("3800"), rates });
    expect(s.costPaisa).toBe(tk("4510"));
    expect(s.entry).toEqual({ debitPaisa: tk("710"), creditPaisa: 0 });
    expect(rates.baburchiPaisa + s.differencePaisa).toBe(tk("1110"));
    expect(tk("65") + tk("1110")).toBe(tk("1175"));
  });

  it("deposit ৳4,200: ate ৳4,000 gets ৳200 back, ate ৳4,400 owes ৳200 (context.txt examples)", () => {
    // 40 lunches × 50 + 32 dinners × 62.50 = 4000 (rates chosen only to reach the example amount)
    const back = mealSettlement({
      counts: { breakfast: 0, lunch: 40, dinner: 32 },
      depositPaisa: tk("4200"),
      rates: { ...rates, lunchRatePaisa: tk("50"), dinnerRatePaisa: tk("62.50") },
    });
    expect(back.costPaisa).toBe(tk("4000"));
    expect(back.differencePaisa).toBe(-tk("200"));
    const owe = mealSettlement({ counts: { breakfast: 0, lunch: 40, dinner: 40 }, depositPaisa: tk("4200"), rates });
    expect(owe.differencePaisa).toBe(tk("200"));
  });
});

describe("monthly token (207 PDF, September 2026)", () => {
  const r4200 = { ...rates, mealDepositPaisa: tk("4200"), baburchiPaisa: 0 };

  it("Abir: 8000 + 4200 + meal 7213 + advance/SC 7000 = 26,413", () => {
    const t = buildToken({
      rentPaisa: tk("8000"),
      rates: r4200,
      previousBalances: { meal: tk("7213"), advance: tk("7000") },
    });
    expect(t.currentTotalPaisa).toBe(tk("12200"));
    expect(t.totalPaisa).toBe(tk("26413"));
  });

  it("Saikot: no rent, meal credit ৳3,500 → pays ৳700", () => {
    const t = buildToken({ rentPaisa: 0, rates: r4200, previousBalances: { meal: -tk("3500") } });
    expect(t.current.map((l) => l.head)).toEqual(["meal"]);
    expect(t.totalPaisa).toBe(tk("700"));
  });

  it("Siam: the hand-made token said ৳44,973 but left out ৳13,000; the correct total is ৳57,973", () => {
    const t = buildToken({
      rentPaisa: tk("10500"),
      rates: r4200,
      previousBalances: { meal: tk("11473"), advance: tk("13000"), rent: tk("18800") },
    });
    expect(t.totalPaisa).toBe(tk("57973"));
  });

  it("context.txt §14: Salek rent 6000 + deposit 3800 + baburchi 400 + previous meal 65 = 10,265", () => {
    const t = buildToken({ rentPaisa: tk("6000"), rates, previousBalances: { meal: tk("65") } });
    expect(t.totalPaisa).toBe(tk("10265"));
  });

  it("adds the yearly service charge only in the chosen month", () => {
    const t = buildToken({
      rentPaisa: tk("6000"),
      rates: { ...rates, serviceChargeThisMonth: true },
      previousBalances: {},
    });
    expect(t.current.map((l) => l.head)).toEqual(["rent", "meal", "baburchi", "service_charge"]);
    expect(t.totalPaisa).toBe(tk("16200"));
  });
});

describe("balances, dues and payments", () => {
  const lines: LedgerLine[] = [
    { head: "rent", period: "2026-08", debitPaisa: tk("6000"), creditPaisa: 0 },
    { head: "rent", period: "2026-08", debitPaisa: 0, creditPaisa: tk("4000") },
    { head: "meal", period: "2026-08", debitPaisa: tk("3800"), creditPaisa: 0 },
    { head: "meal", period: "2026-08", debitPaisa: 0, creditPaisa: tk("3800") },
    { head: "meal", period: "2026-08", debitPaisa: 0, creditPaisa: tk("335") }, // settlement credit
    { head: "rent", period: "2026-09", debitPaisa: tk("6000"), creditPaisa: 0 },
    { head: "meal", period: "2026-09", debitPaisa: tk("3800"), creditPaisa: 0 },
    { head: "baburchi", period: "2026-09", debitPaisa: tk("400"), creditPaisa: 0 },
  ];

  it("computes balances per head", () => {
    expect(balancesByHead(lines)).toEqual({ rent: tk("8000"), meal: tk("3465"), baburchi: tk("400") });
  });

  it("lists open dues oldest first, using a head's credit against its later dues", () => {
    expect(openDues(lines)).toEqual([
      { head: "rent", period: "2026-08", amountPaisa: tk("2000") },
      { head: "rent", period: "2026-09", amountPaisa: tk("6000") },
      { head: "meal", period: "2026-09", amountPaisa: tk("3465") },
      { head: "baburchi", period: "2026-09", amountPaisa: tk("400") },
    ]);
  });

  it("pays the oldest month first, then meal → rent → baburchi", () => {
    const { allocations, leftoverPaisa } = allocatePayment(openDues(lines), tk("8000"));
    expect(allocations).toEqual([
      { head: "rent", period: "2026-08", amountPaisa: tk("2000") },
      { head: "meal", period: "2026-09", amountPaisa: tk("3465") },
      { head: "rent", period: "2026-09", amountPaisa: tk("2535") },
    ]);
    expect(leftoverPaisa).toBe(0);
  });

  it("keeps extra money as credit", () => {
    const { allocations, leftoverPaisa } = allocatePayment(
      [{ head: "rent", period: "2026-09", amountPaisa: tk("100") }],
      tk("150"),
    );
    expect(allocations).toHaveLength(1);
    expect(leftoverPaisa).toBe(tk("50"));
    expect(() => allocatePayment([], 0)).toThrow();
  });

  it("uses credit to clear other dues", () => {
    expect(netCredits({ credit: -tk("500"), meal: -tk("335"), rent: tk("600"), baburchi: tk("400") })).toEqual([
      { fromHead: "credit", toHead: "rent", amountPaisa: tk("500") },
      { fromHead: "meal", toHead: "rent", amountPaisa: tk("100") },
      { fromHead: "meal", toHead: "baburchi", amountPaisa: tk("235") },
    ]);
  });

  it("advance = rent × months", () => {
    expect(advanceAmount(tk("6000"), 2)).toBe(tk("12000"));
    expect(advanceAmount(tk("7600"), 2)).toBe(tk("15200"));
  });
});

describe("token payment status", () => {
  const P = "2026-09";
  const token: LedgerLine[] = [
    { head: "rent", period: "2026-08", debitPaisa: tk("200"), creditPaisa: 0 }, // older due shown on the token
    { head: "rent", period: P, debitPaisa: tk("6000"), creditPaisa: 0 },
    { head: "meal", period: P, debitPaisa: tk("4000"), creditPaisa: 0 },
  ];
  const total = tk("10200");
  it("is unpaid before any payment", () => {
    expect(tokenPaymentStatus(token, P, total)).toEqual({ remainingPaisa: total, paidPaisa: 0, status: "unpaid" });
  });
  it("is partial after part payment", () => {
    const lines = [
      ...token,
      { head: "rent" as const, period: "2026-08", debitPaisa: 0, creditPaisa: tk("200") },
      { head: "meal" as const, period: P, debitPaisa: 0, creditPaisa: tk("4000") },
    ];
    expect(tokenPaymentStatus(lines, P, total)).toEqual({
      remainingPaisa: tk("6000"),
      paidPaisa: tk("4200"),
      status: "partial",
    });
  });
  it("is paid when everything up to the month is cleared, even with next month's charges on the account", () => {
    const lines = [
      ...token,
      { head: "rent" as const, period: "2026-08", debitPaisa: 0, creditPaisa: tk("200") },
      { head: "rent" as const, period: P, debitPaisa: 0, creditPaisa: tk("6000") },
      { head: "meal" as const, period: P, debitPaisa: 0, creditPaisa: tk("4000") },
      { head: "rent" as const, period: "2026-10", debitPaisa: tk("6000"), creditPaisa: 0 },
    ];
    expect(tokenPaymentStatus(lines, P, total).status).toBe("paid");
  });
});
