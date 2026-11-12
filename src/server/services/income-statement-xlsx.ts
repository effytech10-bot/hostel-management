import "server-only";
import ExcelJS from "exceljs";
import { formatPeriod, type Period } from "@/lib/dates";
import type { SessionUser } from "@/server/auth/session";
import { FUND_COLOR, FUND_LABEL, FUND_SHORT, type Fund } from "@/server/domain/finance";
import { getIncomeStatement } from "./finance";

/** The income statements as a formatted Excel workbook: Summary, one sheet per account, expense details. */

const TAKA = '"৳"#,##0.00;[Red]-"৳"#,##0.00';
const tk = (paisa: number) => paisa / 100;
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });

const C = {
  ink: "#161A2E",
  muted: "#666D8C",
  head: "#EEF0F6",
  okBg: "#E8F7ED",
  ok: "#15803D",
  badBg: "#FDECEC",
  bad: "#B42323",
  line: "#E0E3EE",
};
/** Light tint of an account colour for its header band. */
const TINT: Record<Fund, string> = { rent: "#EEF0FC", meal: "#FDF0E7", service: "#E6F5F5" };

const thin = { style: "thin" as const, color: { argb: argb(C.line) } };

function title(ws: ExcelJS.Worksheet, text: string, sub: string, color: string, cols = 4) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell("A1");
  t.value = text;
  t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  t.fill = fill(color);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell("A2");
  s.value = sub;
  s.font = { italic: true, color: { argb: argb(C.muted) } };
  ws.addRow([]);
}

function header(ws: ExcelJS.Worksheet, cells: string[]) {
  const r = ws.addRow(cells);
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: argb(C.ink) } };
    c.fill = fill(C.head);
    c.border = { bottom: thin };
  });
  r.getCell(1).alignment = { indent: 1 };
  return r;
}

function section(ws: ExcelJS.Worksheet, text: string, tint: string) {
  const r = ws.addRow([text]);
  ws.mergeCells(r.number, 1, r.number, 4);
  r.getCell(1).font = { bold: true, size: 11.5, color: { argb: argb(C.ink) } };
  r.getCell(1).fill = fill(tint);
  return r;
}

function money(r: ExcelJS.Row, cols: number[]) {
  for (const c of cols) r.getCell(c).numFmt = TAKA;
}

function highlight(r: ExcelJS.Row, bg: string, fg: string, size = 11) {
  r.eachCell({ includeEmpty: true }, (c, n) => {
    if (n > 4) return;
    c.fill = fill(bg);
    c.font = { bold: true, size, color: { argb: argb(n === 1 ? C.ink : fg) } };
    c.border = { top: { style: "medium", color: { argb: argb(fg) } } };
  });
}

export async function incomeStatementWorkbook(actor: SessionUser, period: Period): Promise<Buffer> {
  const s = await getIncomeStatement(actor, period);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rangdhanu Hostel";
  wb.created = new Date();
  const sub = `${actor.orgName} · ${formatPeriod(period)} (up to ${s.asOf}) · amounts in taka`;

  // ---- Summary ----
  const sum = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 4 }] });
  sum.columns = [
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
  ];
  title(sum, `Income statement · ${formatPeriod(period)}`, sub, "#3340B0", 7);
  header(sum, [
    "Account",
    "Earned",
    "Spent",
    "Profit / loss",
    "Earned since start",
    "Spent since start",
    "Profit since start",
  ]);
  for (const a of s.accounts) {
    const r = sum.addRow([
      FUND_LABEL[a.fund],
      tk(a.earned.monthPaisa),
      tk(a.spent.monthPaisa),
      tk(a.profit.monthPaisa),
      tk(a.earned.allPaisa),
      tk(a.spent.allPaisa),
      tk(a.profit.allPaisa),
    ]);
    money(r, [2, 3, 4, 5, 6, 7]);
    r.getCell(1).fill = fill(TINT[a.fund]);
    r.getCell(1).font = { bold: true };
    for (const c of [4, 7]) {
      const v = r.getCell(c).value as number;
      r.getCell(c).fill = fill(v >= 0 ? C.okBg : C.badBg);
      r.getCell(c).font = { bold: true, color: { argb: argb(v >= 0 ? C.ok : C.bad) } };
    }
  }
  const t = sum.addRow([
    "All accounts",
    tk(s.totals.earned.monthPaisa),
    tk(s.totals.spent.monthPaisa),
    tk(s.totals.profit.monthPaisa),
    tk(s.totals.earned.allPaisa),
    tk(s.totals.spent.allPaisa),
    tk(s.totals.profit.allPaisa),
  ]);
  money(t, [2, 3, 4, 5, 6, 7]);
  t.eachCell((c) => {
    c.font = { bold: true, size: 12 };
    c.border = { top: { style: "medium", color: { argb: argb(C.ink) } } };
  });
  t.getCell(4).fill = fill(s.totals.profit.monthPaisa >= 0 ? C.okBg : C.badBg);

  sum.addRow([]);
  const tr = sum.addRow(["Profit per month (last 6 months)"]);
  tr.getCell(1).font = { bold: true, size: 12 };
  header(sum, ["Month", ...s.accounts.map((a) => FUND_SHORT[a.fund]), "All accounts"]);
  const firstTrend = sum.rowCount + 1;
  for (const m of s.trend) {
    const r = sum.addRow([
      formatPeriod(m.period),
      ...m.funds.map((f) => tk(f.profitPaisa)),
      tk(m.funds.reduce((x, f) => x + f.profitPaisa, 0)),
    ]);
    money(r, [2, 3, 4, 5]);
  }
  if (s.trend.length) {
    sum.addConditionalFormatting({
      ref: `B${firstTrend}:E${sum.rowCount}`,
      rules: [
        {
          type: "cellIs",
          operator: "lessThan",
          formulae: ["0"],
          priority: 1,
          style: { font: { color: { argb: argb(C.bad) } }, fill: fill(C.badBg) },
        },
        {
          type: "cellIs",
          operator: "greaterThan",
          formulae: ["0"],
          priority: 2,
          style: { font: { color: { argb: argb(C.ok) } }, fill: fill(C.okBg) },
        },
      ],
    });
  }
  sum.addRow([]);
  sum.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const note = sum.addRow([
    "Advance and the owner's own money are not income. Meal income = meals actually eaten × the meal rates (not the deposit).",
  ]);
  sum.mergeCells(note.number, 1, note.number, 7);
  note.getCell(1).font = { italic: true, color: { argb: argb(C.muted) } };

  // ---- One sheet per account ----
  for (const a of s.accounts) {
    const ws = wb.addWorksheet(FUND_SHORT[a.fund], {
      views: [{ state: "frozen", ySplit: 4 }],
      properties: { tabColor: { argb: argb(FUND_COLOR[a.fund]) } },
    });
    ws.columns = [{ width: 46 }, { width: 18 }, { width: 20 }, { width: 44 }];
    title(ws, `${FUND_LABEL[a.fund]} · income statement`, sub, FUND_COLOR[a.fund]);
    header(ws, ["", formatPeriod(period), "Since the start", "Note"]);

    section(ws, "EARNED", TINT[a.fund]);
    for (const l of a.income) {
      const r = ws.addRow([`   ${l.label}`, tk(l.monthPaisa), tk(l.allPaisa), l.note ?? ""]);
      money(r, [2, 3]);
      r.getCell(4).font = { italic: true, color: { argb: argb(C.muted) } };
    }
    const te = ws.addRow(["Total earned", tk(a.earned.monthPaisa), tk(a.earned.allPaisa)]);
    money(te, [2, 3]);
    te.eachCell((c) => (c.font = { bold: true, color: { argb: argb(C.ok) } }));
    te.getCell(1).font = { bold: true };
    te.eachCell({ includeEmpty: true }, (c, n) => n <= 4 && (c.fill = fill(C.okBg)));

    section(ws, "SPENT", TINT[a.fund]);
    if (a.expenses.length === 0)
      ws.addRow(["   No expenses typed for this account"]).getCell(1).font = {
        italic: true,
        color: { argb: argb(C.muted) },
      };
    for (const l of a.expenses) money(ws.addRow([`   ${l.label}`, tk(l.monthPaisa), tk(l.allPaisa)]), [2, 3]);
    const ts = ws.addRow(["Total spent", tk(a.spent.monthPaisa), tk(a.spent.allPaisa)]);
    money(ts, [2, 3]);
    ts.eachCell((c) => (c.font = { bold: true, color: { argb: argb(C.bad) } }));
    ts.getCell(1).font = { bold: true };
    ts.eachCell({ includeEmpty: true }, (c, n) => n <= 4 && (c.fill = fill(C.badBg)));

    ws.addRow([]);
    const good = a.profit.monthPaisa >= 0;
    const pr = ws.addRow([
      good ? "PROFIT (earned − spent)" : "LOSS (earned − spent)",
      tk(a.profit.monthPaisa),
      tk(a.profit.allPaisa),
      "",
    ]);
    money(pr, [2, 3]);
    highlight(pr, good ? C.okBg : C.badBg, good ? C.ok : C.bad, 13);
    pr.height = 22;

    ws.addRow([]);
    section(ws, `MONEY IN THIS ACCOUNT DURING ${formatPeriod(period).toUpperCase()}`, TINT[a.fund]);
    for (const step of a.cash) {
      const signed = step.kind === "start" || step.kind === "end" ? step.amountPaisa : step.amountPaisa;
      const r = ws.addRow([`   ${step.label}`, tk(signed)]);
      money(r, [2]);
      if (step.kind === "in") r.getCell(2).font = { color: { argb: argb(C.ok) } };
      if (step.kind === "out") r.getCell(2).font = { color: { argb: argb(C.bad) } };
      if (step.kind === "end") {
        r.eachCell((c) => (c.font = { bold: true }));
        r.getCell(1).border = { top: thin };
        r.getCell(2).border = { top: thin };
      }
    }

    ws.addRow([]);
    section(ws, "COLLECTION", TINT[a.fund]);
    header(ws, ["", "Done", "Expected", "Done %"]);
    for (const p of a.progress) {
      const r = ws.addRow([
        `   ${p.label}`,
        p.unit === "taka" ? tk(p.part) : p.part,
        p.unit === "taka" ? tk(p.whole) : p.whole,
        p.whole > 0 ? p.part / p.whole : 0,
      ]);
      if (p.unit === "taka") money(r, [2, 3]);
      r.getCell(4).numFmt = "0%";
      ws.addConditionalFormatting({
        ref: `D${r.number}`,
        rules: [
          {
            type: "dataBar",
            priority: 1,
            cfvo: [
              { type: "num", value: 0 },
              { type: "num", value: 1 },
            ],
            color: { argb: argb(FUND_COLOR[a.fund]) },
          } as ExcelJS.ConditionalFormattingRule,
        ],
      });
    }

    ws.addRow([]);
    section(ws, "GOOD TO KNOW", TINT[a.fund]);
    for (const m of a.memo) {
      const r = ws.addRow([`   ${m.label}`, m.value]);
      r.getCell(2).alignment = { horizontal: "right" };
      if (m.tone === "bad") r.getCell(2).font = { bold: true, color: { argb: argb(C.bad) } };
      if (m.tone === "ok") r.getCell(2).font = { bold: true, color: { argb: argb(C.ok) } };
    }

    ws.addRow([]);
    section(ws, "MONTH BY MONTH (LAST 6 MONTHS)", TINT[a.fund]);
    header(ws, ["Month", "Earned", "Spent", "Profit / loss"]);
    const first = ws.rowCount + 1;
    for (const m of s.trend) {
      const f = m.funds.find((x) => x.fund === a.fund)!;
      money(ws.addRow([formatPeriod(m.period), tk(f.earnedPaisa), tk(f.spentPaisa), tk(f.profitPaisa)]), [2, 3, 4]);
    }
    if (s.trend.length) {
      ws.addConditionalFormatting({
        ref: `D${first}:D${ws.rowCount}`,
        rules: [
          {
            type: "cellIs",
            operator: "lessThan",
            formulae: ["0"],
            priority: 1,
            style: { font: { bold: true, color: { argb: argb(C.bad) } }, fill: fill(C.badBg) },
          },
          {
            type: "cellIs",
            operator: "greaterThan",
            formulae: ["0"],
            priority: 2,
            style: { font: { bold: true, color: { argb: argb(C.ok) } }, fill: fill(C.okBg) },
          },
        ],
      });
    }
    ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  // ---- Expense details ----
  const ex = wb.addWorksheet("Expense details", { views: [{ state: "frozen", ySplit: 4 }] });
  ex.columns = [
    { width: 13 },
    { width: 12 },
    { width: 24 },
    { width: 18 },
    { width: 34 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 30 },
  ];
  title(ex, `Expenses and owner money · ${formatPeriod(period)}`, sub, "#3A405C", 9);
  header(ex, ["Date", "Voucher", "Account", "Kind / category", "What", "Paid from", "By", "Amount", "Status"]);
  const firstEx = ex.rowCount;
  for (const e of [...s.entries].reverse()) {
    const kind =
      e.kind === "expense"
        ? (e.category ?? "Expense")
        : e.kind === "owner_withdraw"
          ? "Owner took out"
          : "Owner put in";
    const r = ex.addRow([
      e.entryDate,
      e.voucherNo,
      e.fundLabel,
      kind,
      e.title,
      e.accountName,
      e.byName ?? "",
      tk(e.amountPaisa),
      e.voidedAt ? `Cancelled: ${e.voidReason ?? ""}` : "Counted",
    ]);
    money(r, [8]);
    r.getCell(3).fill = fill(TINT[e.fund]);
    if (e.voidedAt) r.eachCell((c) => (c.font = { strike: true, color: { argb: argb(C.muted) } }));
  }
  ex.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  if (s.entries.length) ex.autoFilter = { from: { row: firstEx, column: 1 }, to: { row: ex.rowCount, column: 9 } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
