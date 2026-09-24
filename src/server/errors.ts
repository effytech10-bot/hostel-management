export type AppErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "AUTH";

/** An expected error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

/** Convert any thrown error into a result a form can display. Unexpected errors are logged, not leaked. */
export function toActionError(error: unknown): ActionState {
  if (error instanceof AppError) return { error: error.message };
  console.error(error);
  return { error: "Something went wrong. Please try again." };
}
