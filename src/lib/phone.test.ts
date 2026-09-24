import { describe, expect, it } from "vitest";
import { normalizeBdPhone } from "./phone";

describe("normalizeBdPhone", () => {
  it("normalizes common formats to 01XXXXXXXXX", () => {
    expect(normalizeBdPhone("01867271100")).toBe("01867271100");
    expect(normalizeBdPhone("+8801867271100")).toBe("01867271100");
    expect(normalizeBdPhone("8801867271100")).toBe("01867271100");
    expect(normalizeBdPhone("01867-271100")).toBe("01867271100");
    expect(normalizeBdPhone("০১৮৬৭২৭১১০০")).toBe("01867271100");
  });

  it("rejects non-mobile numbers", () => {
    expect(normalizeBdPhone("0186727110")).toBeNull();
    expect(normalizeBdPhone("01267271100")).toBeNull();
    expect(normalizeBdPhone("hello")).toBeNull();
  });
});
