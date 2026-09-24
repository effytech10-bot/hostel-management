import { cn } from "@/lib/utils";

export function FormMessage({ error, message, className }: { error?: string; message?: string; className?: string }) {
  if (!error && !message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
        className,
      )}
    >
      {error ?? message}
    </p>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-red-600">{errors[0]}</p>;
}
