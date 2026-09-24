import { describe, expect, it } from "vitest";
import { compareRoomNumbers, expandRoomRange, floorFromRoomNumber, nextSeatLabel, parseSeatLabels } from "./rooms";

describe("floorFromRoomNumber", () => {
  it("derives the floor from 3-4 digit room numbers", () => {
    expect(floorFromRoomNumber("205")).toBe(2);
    expect(floorFromRoomNumber("601")).toBe(6);
    expect(floorFromRoomNumber("1020")).toBe(10);
  });
  it("returns null when it cannot tell", () => {
    expect(floorFromRoomNumber("G-2")).toBeNull();
    expect(floorFromRoomNumber("12")).toBeNull();
  });
});

describe("expandRoomRange", () => {
  it("lists every room in the range", () => {
    expect(expandRoomRange("601", "604")).toEqual(["601", "602", "603", "604"]);
    expect(expandRoomRange("1020", "1020")).toEqual(["1020"]);
  });
  it("rejects bad ranges", () => {
    expect(() => expandRoomRange("605", "601")).toThrow();
    expect(() => expandRoomRange("G1", "G3")).toThrow();
    expect(() => expandRoomRange("100", "300")).toThrow(/At most/);
  });
});

describe("parseSeatLabels", () => {
  it("turns a count into letters", () => {
    expect(parseSeatLabels("2")).toEqual(["A", "B"]);
    expect(parseSeatLabels("4")).toEqual(["A", "B", "C", "D"]);
  });
  it("accepts typed labels", () => {
    expect(parseSeatLabels("a, b,c")).toEqual(["A", "B", "C"]);
    expect(parseSeatLabels("1 2")).toEqual(["1", "2"]);
  });
  it("rejects bad labels", () => {
    expect(() => parseSeatLabels("0")).toThrow();
    expect(() => parseSeatLabels("A,A")).toThrow();
    expect(() => parseSeatLabels("")).toThrow();
    expect(() => parseSeatLabels("A-1")).toThrow();
  });
});

describe("nextSeatLabel / compareRoomNumbers", () => {
  it("finds the next free letter", () => {
    expect(nextSeatLabel(["A", "B"])).toBe("C");
    expect(nextSeatLabel(["B"])).toBe("A");
    expect(nextSeatLabel([])).toBe("A");
  });
  it("sorts room numbers naturally", () => {
    expect(["1020", "601", "205", "G-2"].sort(compareRoomNumbers)).toEqual(["205", "601", "1020", "G-2"]);
  });
});
