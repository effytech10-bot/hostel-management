import { describe, expect, it } from "vitest";
import { formatTaka, multiplyPaisa, parseTaka, sumPaisa, tryParseTaka } from "./money";

describe("parseTaka", () => {
  it("parses whole and decimal taka into paisa", () => {
    expect(parseTaka("8000")).toBe(800000);
    expect(parseTaka("27.50")).toBe(2750);
    expect(parseTaka("27.5")).toBe(2750);
    expect(parseTaka("0.05")).toBe(5);
  });

  it("accepts separators, symbols and Bangla digits", () => {
    expect(parseTaka("1,02,668")).toBe(10266800);
    expect(parseTaka("৳ 7,600")).toBe(760000);
    expect(parseTaka("৮০০০")).toBe(800000);
    expect(parseTaka("-65")).toBe(-6500);
  });

  it("accepts numbers without floating point drift", () => {
    expect(parseTaka(27.5)).toBe(2750);
    expect(parseTaka(0.1 + 0.2)).toBe(30);
  });

  it("rejects invalid input", () => {
    expect(() => parseTaka("")).toThrow();
    expect(() => parseTaka("12.345")).toThrow();
    expect(() => parseTaka("abc")).toThrow();
    expect(tryParseTaka("1.2.3")).toBeNull();
  });
});

describe("formatTaka", () => {
  it("uses Bangladeshi digit grouping", () => {
    expect(formatTaka(10266800)).toBe("৳1,02,668");
    expect(formatTaka(1026500)).toBe("৳10,265");
  });

  it("shows paisa only when present", () => {
    expect(formatTaka(2750)).toBe("৳27.50");
    expect(formatTaka(800000, { alwaysDecimals: true })).toBe("৳8,000.00");
  });

  it("formats negatives and zero", () => {
    expect(formatTaka(-6500)).toBe("-৳65");
    expect(formatTaka(0)).toBe("৳0");
    expect(formatTaka(6500, { symbol: false })).toBe("65");
  });
});

describe("arithmetic", () => {
  it("sums and multiplies in integer paisa", () => {
    // Salek (context.txt): 63 meals × ৳55 = ৳3,465, + baburchi ৳400 = ৳3,865
    const meals = multiplyPaisa(5500, 63);
    expect(meals).toBe(346500);
    expect(sumPaisa([meals, 40000])).toBe(386500);
    expect(() => multiplyPaisa(5500, 1.5)).toThrow();
  });
});
