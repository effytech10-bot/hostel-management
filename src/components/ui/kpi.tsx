import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type KpiTileProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  href?: string;
  tone?: "default" | "red" | "green";
  className?: string;
  onClick?: () => void;
};

export function KpiTile({ label, value, note, href, tone = "default", className, onClick }: KpiTileProps) {
  const isClickable = !!href || !!onClick;

  const content = (
    <div
      className={cn(
        "bg-surface text-ink border-line shadow-card rounded-[12px] border p-[14px_16px] transition-colors",
        isClickable && "hover:border-brand-100 cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <div className="text-muted-foreground text-[12.5px] leading-tight font-medium">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[25px] leading-[1.25] font-bold tabular-nums",
          tone === "red" && "text-bad",
          tone === "green" && "text-ok",
        )}
      >
        {value}
      </div>
      {note && <div className="text-muted-foreground mt-0.5 text-[12px] leading-normal">{note}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {content}
      </Link>
    );
  }

  return content;
}
