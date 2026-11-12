import { formatDate } from "@/lib/dates";
import { formatTaka } from "@/lib/money";

export type MoneyReceiptData = {
  orgName: string;
  receiptNo: string;
  date: string;
  name: string;
  buildingNo: string;
  roomNo: string;
  month: string;
  rentPaisa: number;
  mealPaisa: number;
  /** Pre. meal balance printed on the token (+ the student owed, − the student had money back). */
  preMealPaisa: number;
  tokenId: string;
  amountPaisa: number;
  duePaisa: number;
  advancePaisa: number;
  servicePaisa: number;
  receivedBy: string;
  voided: boolean;
};

const money = (paisa: number) => (paisa === 0 ? "" : formatTaka(paisa, { symbol: false }));

function Box({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="flex items-stretch border border-[#1d2a5c]">
        <span className="w-[42%] shrink-0 border-r border-[#1d2a5c] px-2 py-1.5 text-[12.5px] italic">{label}</span>
        <span className="min-h-[30px] flex-1 px-2 py-1.5 text-right text-[14px] font-semibold tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end gap-2">
      <span className="shrink-0 text-[13px] italic">{label} :</span>
      <span className="min-h-[22px] flex-1 border-b border-dotted border-[#1d2a5c] px-1 text-[14px] font-semibold">
        {value}
      </span>
    </div>
  );
}

/**
 * The hostel's paper money receipt, with the same boxes: Rent, Meal, Pmb, Total M.b, L.Num, Amount,
 * Due Amount, Adv., Service C. The name of whoever saved the payment is printed as "Received by".
 */
export function MoneyReceipt({ r }: { r: MoneyReceiptData }) {
  return (
    <article className="relative mx-auto w-full max-w-[440px] border border-[#1d2a5c] bg-white p-4 font-serif text-[#1d2a5c] print:max-w-none print:border-0">
      {r.voided && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="border-bad text-bad/70 -rotate-12 rounded-md border-4 px-6 py-2 text-5xl font-bold">
            VOID
          </span>
        </div>
      )}

      <header className="flex items-start justify-between gap-3 border-b border-[#1d2a5c] pb-2">
        <p className="text-[19px] leading-tight font-bold">{r.orgName}</p>
        <p className="shrink-0 text-right leading-none">
          <span className="block text-[9px] tracking-[0.45em]">MONEY</span>
          <span className="text-[19px] font-bold tracking-wide">RECEIPT</span>
        </p>
      </header>

      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="font-mono text-[15px] font-semibold text-[#161a2e]">{r.receiptNo}</span>
        <span className="w-1/2">
          <Line label="Date" value={formatDate(r.date)} />
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <Line label="Name" value={r.name} />
        <div className="grid grid-cols-2 gap-3">
          <Line label="Building No." value={r.buildingNo} />
          <Line label="Room No." value={r.roomNo} />
        </div>
        <Line label="Month" value={r.month} />
      </div>

      <p className="mt-4 mb-1.5 text-[13px] italic">Payment Category</p>
      <div className="grid grid-cols-2 gap-2">
        <Box label="Rent" value={money(r.rentPaisa)} />
        <Box label="Meal" value={money(r.mealPaisa)} />
        <Box label="Pmb" value={money(r.preMealPaisa)} />
        <Box label="Total M.b" value={money(r.mealPaisa)} />
        <Box label="L.Num" value={r.tokenId} wide />
        <Box label="Adv." value={money(r.advancePaisa)} />
        <Box label="Service C." value={money(r.servicePaisa)} />
        <Box label="Amount" value={formatTaka(r.amountPaisa, { symbol: false })} />
        <Box label="Due Amount" value={formatTaka(r.duePaisa, { symbol: false })} />
      </div>

      <footer className="mt-9 flex items-end justify-between gap-6 text-[12px] italic">
        <span className="w-[42%] border-t border-dotted border-[#1d2a5c] pt-1">Student&apos;s Sign.</span>
        <span className="w-[42%] text-center">
          <span
            className="block truncate pb-0.5 text-[17px] not-italic"
            style={{ fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive' }}
          >
            {r.receivedBy}
          </span>
          <span className="block border-t border-dotted border-[#1d2a5c] pt-1">Received by</span>
        </span>
      </footer>
    </article>
  );
}
