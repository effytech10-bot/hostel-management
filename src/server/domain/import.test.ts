import { describe, expect, it } from "vitest";
import { cleanImportRow, cleanPhone, isBlankRow, mapHeaders, openingLines } from "./import";

describe("import headers", () => {
  it("maps headers and aliases, reports missing required ones", () => {
    const { map, missing } = mapHeaders(["Sl.No", "Name", "Room", "Rent", "Mobile", "Advance"]);
    expect([...map.values()]).toEqual(["name", "room", "rent", "phone", "advancePaid"]);
    expect(missing).toEqual(["Building"]);
  });
});

describe("cleanImportRow", () => {
  const base = { building: "177\\1", room: "201.0", name: "Rafid", phone: "1711905813", rent: "8,100" };
  it("cleans a normal row", () => {
    const { row, errors } = cleanImportRow({
      ...base,
      seat: "b",
      admissionDate: "05/01/2025",
      rentDue: "1,600",
      advancePaid: "16200",
    });
    expect(errors).toEqual([]);
    expect(row).toMatchObject({
      building: "177/1",
      room: "201",
      seat: "B",
      phone: "01711905813",
      rentPaisa: 810000,
      admissionDate: "2025-01-05",
      rentDuePaisa: 160000,
      advancePaidPaisa: 1620000,
    });
  });
  it("collects all problems", () => {
    const { row, errors } = cleanImportRow({ name: "A", phone: "12345", rentDue: "abc", admissionDate: "soon" });
    expect(row).toBeNull();
    expect(errors).toHaveLength(6);
  });
  it("empty rent means room default", () => {
    expect(cleanImportRow({ ...base, rent: "" }).row?.rentPaisa).toBeNull();
  });
  it("blank rows", () => {
    expect(isBlankRow({ name: " ", room: "" })).toBe(true);
    expect(isBlankRow({ name: "x" })).toBe(false);
  });
  it("phones", () => {
    expect(cleanPhone("+8801711905813")).toBe("01711905813");
    expect(cleanPhone("1711905813.0")).toBe("01711905813");
    expect(cleanPhone("0171")).toBeNull();
  });
});

describe("openingLines", () => {
  it("makes charge + payment for advance paid", () => {
    const { row } = cleanImportRow({
      building: "1",
      room: "1",
      name: "Ab",
      phone: "01711905813",
      rentDue: "500",
      credit: "65",
      advancePaid: "12000",
      advanceDue: "3000",
    });
    const lines = openingLines(row!);
    expect(lines.map((l) => [l.head, l.amountPaisa, l.paid])).toEqual([
      ["rent", 50000, false],
      ["credit", -6500, false],
      ["advance", 1500000, false],
      ["advance", -1200000, true],
    ]);
    // Net: owes 500 + 3000 advance - 65 credit
    expect(lines.reduce((s, l) => s + l.amountPaisa, 0)).toBe(50000 + 300000 - 6500);
  });
});
