import { describe, expect, it } from "vitest";
import { bnDate, bnPeriod, categoryOf, describeAudit, sentenceText, type AuditLookups } from "./audit-text";

const S1 = "11111111-1111-1111-1111-111111111111";
const P1 = "22222222-2222-2222-2222-222222222222";
const B1 = "33333333-3333-3333-3333-333333333333";

const L: AuditLookups = {
  students: new Map([[S1, { name: "Abir", code: "10001" }]]),
  payments: new Map([
    [P1, { studentId: S1, amountPaisa: 500000, receiptNo: "R-000089", tokenCode: "2611-207601A-001" }],
  ]),
  buildings: new Map([[B1, "207"]]),
  rooms: new Map(),
  seats: new Map(),
  members: new Map(),
  accounts: new Map(),
  area: "/admin",
};

const row = (action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) => ({
  action,
  entityType,
  entityId,
  before,
  after,
});

describe("audit sentences", () => {
  it("dates and months in Bangla", () => {
    expect(bnPeriod("2026-11")).toBe("নভেম্বর 2026");
    expect(bnDate("2026-10-23")).toBe("23 অক্টোবর 2026");
    expect(categoryOf("payment.void")).toBe("money");
    expect(categoryOf("whatever.x")).toBe("other");
  });

  it("payment taken", () => {
    const v = describeAudit(
      row("payment.create", "payment", P1, null, {
        token: "2611-207601A-001",
        account: "Cash in hand",
        receiptNo: "R-000089",
        amountPaisa: 500000,
        allocations: [{ head: "rent", period: "2026-11", amountPaisa: 500000 }],
        leftoverPaisa: 0,
      }),
      L,
    );
    expect(sentenceText(v.sentence)).toBe("Abir (ID 10001) টাকা দিয়েছে: ৳5,000");
    expect(v.tone).toBe("ok");
    expect(v.facts.map((f) => f.label)).toEqual(["রসিদ", "টোকেন", "কোথায় নেওয়া হয়েছে", "কোন খাতে গেছে"]);
    expect(v.facts.find((f) => f.label === "কোন খাতে গেছে")?.value).toBe("ভাড়া (নভেম্বর 2026) ৳5,000");
  });

  it("payment voided", () => {
    const v = describeAudit(
      row(
        "payment.void",
        "payment",
        P1,
        { studentId: S1, amountPaisa: 300000, receiptNo: "R-1" },
        { reason: "Wrong student" },
      ),
      L,
    );
    expect(sentenceText(v.sentence)).toContain("Abir (ID 10001)-এর ৳3,000 পেমেন্ট বাতিল");
    expect(v.facts[0]).toEqual({ label: "বাতিলের কারণ", value: "Wrong student" });
    expect(v.tone).toBe("bad");
  });

  it("student edit shows only changed fields", () => {
    const v = describeAudit(
      row(
        "student.update",
        "student",
        S1,
        { fullName: "Abir", phone: "017", updatedAt: "x" },
        { fullName: "Abir Hasan", phone: "017", updatedAt: "y" },
      ),
      L,
    );
    expect(v.changes).toEqual([{ label: "নাম", from: "Abir", to: "Abir Hasan" }]);
  });

  it("monthly token run by the system", () => {
    const v = describeAudit(
      row("billing.token_run", "billing_period", "2026-11", null, {
        tokensMade: 10,
        closedPeriod: "2026-10",
        byCron: true,
      }),
      L,
    );
    expect(sentenceText(v.sentence)).toBe("নভেম্বর 2026-এর টোকেন বানানো হয়েছে: 10 জন ছাত্রের");
    expect(v.facts[1].value).toContain("অটো");
  });

  it("meal day lists who is off", () => {
    const v = describeAudit(
      row("meal.save_day", "building", B1, null, {
        date: "2026-09-18",
        students: 10,
        offs: [
          { slot: "breakfast", studentId: S1 },
          { slot: "dinner", studentId: S1 },
        ],
      }),
      L,
    );
    expect(sentenceText(v.sentence)).toBe("বিল্ডিং 207-এর 18 সেপ্টেম্বর 2026 তারিখের মিল সেভ করা হয়েছে");
    expect(v.facts[0].value).toBe("Abir: সকালের নাস্তা, রাতের খাবার");
  });

  it("meal cut-off change", () => {
    const v = describeAudit(
      row("settings.meal_cutoff", "organization", null, { mealCutoffHour: 22 }, { mealCutoffHour: 21 }),
      L,
    );
    expect(v.changes[0]).toEqual({ label: "সময়সীমা", from: "আগের রাত 10টা পর্যন্ত", to: "আগের রাত 9টা পর্যন্ত" });
  });

  it("unknown action still readable", () => {
    const v = describeAudit(row("something.new_thing", "x", null, null, null), L);
    expect(sentenceText(v.sentence)).toContain("something new thing");
  });
});
