import "server-only";
import { formatPeriod } from "@/lib/dates";
import type { ReportParams } from "@/lib/report-params";
import type { SessionUser } from "@/server/auth/session";
import { HEAD_LABEL } from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { listCollections } from "./payments";
import { balanceReport, BILLED_HEADS, mealSettlementReport, monthReport } from "./reports";

/** Taka with 2 decimals and no thousands separator, so Excel reads it as a number. */
const tk = (paisa: number) => (paisa / 100).toFixed(2);

export async function reportCsv(actor: SessionUser, p: ReportParams): Promise<{ filename: string; rows: string[][] }> {
  switch (p.r) {
    case "dues": {
      const { rows } = await balanceReport(actor, {
        buildingId: p.building,
        status: p.status,
        batchId: p.batch,
        show: p.show,
      });
      const heads = ["rent", "meal", "baburchi", "service_charge", "advance", "other", "credit"] as const;
      return {
        filename: `dues-${p.status}-${p.show}`,
        rows: [
          [
            "Student ID",
            "Name",
            "Phone",
            "Status",
            "Left on",
            "Building",
            "Room-Seat",
            "Batch",
            ...heads.map((h) => HEAD_LABEL[h]),
            "Total (due + / credit -)",
            "Advance held",
          ],
          ...rows.map((r) => [
            r.studentCode,
            r.fullName,
            r.phone,
            r.status,
            r.leftDate ?? "",
            r.buildingCode,
            r.seatText,
            r.batchName ?? "",
            ...heads.map((h) => tk(r.balances[h] ?? 0)),
            tk(r.totalPaisa),
            tk(r.advanceHeldPaisa),
          ]),
        ],
      };
    }
    case "collections": {
      const { rows } = await listCollections(actor, { from: p.from, to: p.to, buildingId: p.building });
      return {
        filename: `collections-${p.from}-to-${p.to}`,
        rows: [
          [
            "Date",
            "Receipt",
            "Student ID",
            "Name",
            "Building",
            "Account",
            "Method",
            "Trx ID",
            "Amount",
            "Received by",
            "Void",
          ],
          ...rows.map((r) => [
            r.paidDate,
            r.receiptNo,
            r.studentCode,
            r.studentName,
            r.buildingCode ?? "",
            r.accountName,
            r.method,
            r.trxId ?? "",
            tk(r.amountPaisa),
            r.receivedByName ?? "",
            r.voidedAt ? "VOID" : "",
          ]),
        ],
      };
    }
    case "meals": {
      const { rows } = await mealSettlementReport(actor, p.month, p.building);
      return {
        filename: `meal-settlement-${p.month}`,
        rows: [
          [
            "Student ID",
            "Name",
            "Status",
            "Building",
            "Breakfast",
            "Lunch",
            "Dinner",
            "Meal cost",
            "Deposit",
            "Result (+ student pays / - student gets)",
          ],
          ...rows.map((r) => [
            r.studentCode,
            r.fullName,
            r.status,
            r.buildingCode ?? "",
            String(r.breakfast),
            String(r.lunch),
            String(r.dinner),
            tk(r.costPaisa),
            tk(r.depositPaisa),
            tk(r.differencePaisa),
          ]),
        ],
      };
    }
    case "month": {
      const { rows, total } = await monthReport(actor, p.month);
      const all = total ? [...rows, total] : rows;
      return {
        filename: `month-${p.month}`,
        rows: [
          [
            `${formatPeriod(p.month)}`,
            "Tokens",
            "Paid",
            "Partly paid",
            "Unpaid",
            ...BILLED_HEADS.map((h) => `${HEAD_LABEL[h]} billed`),
            "Total billed",
            "Collected in month",
            "Meal cost settled",
            "Students settled",
          ],
          ...all.map((r) => [
            r.buildingCode,
            String(r.tokens),
            String(r.paid),
            String(r.partial),
            String(r.unpaid),
            ...BILLED_HEADS.map((h) => tk(r.billed[h])),
            tk(r.billedTotalPaisa),
            tk(r.collectedPaisa),
            tk(r.mealCostPaisa),
            String(r.mealStudents),
          ]),
        ],
      };
    }
    default:
      throw new AppError("VALIDATION", "This report cannot be downloaded.");
  }
}

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // BOM so Excel opens Bangla names and ৳ correctly.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
