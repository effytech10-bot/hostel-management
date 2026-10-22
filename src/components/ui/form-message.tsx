import { cn } from "@/lib/utils";

export function FormMessage({ error, message, className }: { error?: string; message?: string; className?: string }) {
  if (!error && !message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-[10px] border px-3 py-2 text-[13px] leading-normal",
        error ? "border-bad-line bg-bad-bg text-bad" : "border-ok-line bg-ok-bg text-ok",
        className,
      )}
    >
      {error ?? message}
    </p>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-bad mt-1 text-[11.5px] font-medium">{errors[0]}</p>;
}
