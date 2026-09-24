import "server-only";
import { z } from "zod";
import { toActionError, type ActionState } from "@/server/errors";

/**
 * Standard server-action body: validate form input with Zod, run the service, turn errors into ActionState.
 * Call redirect() AFTER this returns (redirect throws, so it must not run inside the try).
 */
export async function runForm<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  run: (data: z.output<S>) => Promise<T>,
): Promise<{ state: ActionState; value?: T }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      state: {
        error: flat.formErrors[0] ?? "Please fix the highlighted fields.",
        fieldErrors: flat.fieldErrors as Record<string, string[] | undefined>,
      },
    };
  }
  try {
    const value = await run(parsed.data);
    return { state: { ok: true }, value };
  } catch (error) {
    return { state: toActionError(error) };
  }
}

export function formToObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData);
}
