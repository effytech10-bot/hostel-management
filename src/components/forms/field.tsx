import { FieldError } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = React.ComponentProps<"input"> & {
  name: string;
  label: string;
  hint?: string;
  errors?: Record<string, string[] | undefined>;
  wrapperClassName?: string;
};

/** Label + input + error message, wired by name. */
export function Field({ name, label, hint, errors, wrapperClassName, id, ...inputProps }: FieldProps) {
  const inputId = id ?? `f-${name}`;
  const fieldErrors = errors?.[name];
  return (
    <div className={cn("flex flex-col gap-2", wrapperClassName)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} name={name} aria-invalid={!!fieldErrors?.length} {...inputProps} />
      {hint && !fieldErrors?.length && <p className="text-muted-foreground text-xs">{hint}</p>}
      <FieldError errors={fieldErrors} />
    </div>
  );
}
