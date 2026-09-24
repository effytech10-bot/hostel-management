import { describe, expect, it } from "vitest";
import { defaultStudentPassword, newPasswordError } from "./passwords";

describe("passwords", () => {
  it("uses the last 6 digits of the phone as the first password", () => {
    expect(defaultStudentPassword("01711905813")).toBe("905813");
    expect(defaultStudentPassword("01711398385")).toBe("398385");
  });

  it("rejects weak new passwords", () => {
    const phone = "01711905813";
    expect(newPasswordError("short", phone)).toMatch(/at least/);
    expect(newPasswordError("ab905813cd", phone)).toMatch(/phone/);
    expect(newPasswordError("11111111", phone)).toMatch(/easy/);
    expect(newPasswordError("12345678", phone)).toMatch(/easy/);
    expect(newPasswordError("rongdhonu-207", phone)).toBeNull();
  });
});
