"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatPeriod, isValidPeriod } from "@/lib/dates";
import { requireRole } from "@/server/auth/session";
import { toActionError, type ActionState } from "@/server/errors";
import { runMonthEnd } from "@/server/services/month-end";

const schema = z.object({ period: z.string().refine(isValidPeriod) });

export async function runMonthEndAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a month." };
  try {
    const r = await runMonthEnd(actor.orgId, parsed.data.period, actor.membershipId);
    revalidatePath("/", "layout");
    const parts = [];
    if (r.closedPeriod) parts.push(`${formatPeriod(r.closedPeriod)} closed (${r.settled} meal settlement(s)).`);
    parts.push(`${r.tokensMade} token(s) made for ${formatPeriod(r.tokenPeriod)}.`);
    return { ok: true, message: parts.join(" ") };
  } catch (e) {
    return toActionError(e);
  }
}
