"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dhakaDate, formatPeriod, isValidPeriod } from "@/lib/dates";
import { requireRole } from "@/server/auth/session";
import { toActionError, type ActionState } from "@/server/errors";
import { makeEarlyToken, runTokenRun } from "@/server/services/token-engine";

const schema = z.object({ period: z.string().refine(isValidPeriod) });

/** Admin: make this month's tokens (normally done by itself on the 1st at 00:05). */
export async function runMonthEndAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a month." };
  try {
    const r = await runTokenRun(actor.orgId, parsed.data.period, actor.membershipId, dhakaDate());
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `${r.tokensMade} token(s) made for ${formatPeriod(r.tokenPeriod)}.${r.closedPeriod ? ` ${formatPeriod(r.closedPeriod)} is now locked.` : ""}`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

const earlySchema = z.object({ studentId: z.uuid() });

/** Admin: make one student's next-month token now (that month's automatic run then skips them). */
export async function makeEarlyTokenAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { code?: string }> {
  const actor = await requireRole("admin");
  const parsed = earlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Student not found." };
  try {
    const r = await makeEarlyToken(actor.orgId, parsed.data.studentId, actor.membershipId, dhakaDate());
    revalidatePath("/", "layout");
    return { ok: true, message: `Token ${r.code} made for ${formatPeriod(r.period)}.`, code: r.code };
  } catch (e) {
    return toActionError(e);
  }
}
