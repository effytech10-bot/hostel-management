import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { currentPeriod, previousPeriod } from "@/lib/dates";
import { db } from "@/server/db/client";
import { billingPeriods, organizations } from "@/server/db/schema";
import { runMonthEnd } from "@/server/services/month-end";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs every night (vercel.json). For each hostel: if this month's tokens are not made yet, close last month
 * and make them. Automatic mode only starts after an admin has done one month-end by hand
 * (so going live never bills anyone by surprise). Safe to run many times.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = currentPeriod();
  const results: Record<string, unknown>[] = [];

  for (const org of await db().select({ id: organizations.id, slug: organizations.slug }).from(organizations)) {
    const rows = await db()
      .select({ period: billingPeriods.period })
      .from(billingPeriods)
      .where(and(eq(billingPeriods.orgId, org.id), isNotNull(billingPeriods.tokensGeneratedAt)));
    const done = new Set(rows.map((r) => r.period));

    if (done.has(period)) {
      results.push({ org: org.slug, status: "already done" });
      continue;
    }
    if (!done.has(previousPeriod(period))) {
      results.push({ org: org.slug, status: "skipped: run the first month-end by hand" });
      continue;
    }
    try {
      results.push({ org: org.slug, status: "done", ...(await runMonthEnd(org.id, period, null)) });
    } catch (error) {
      console.error(`month-end failed for ${org.slug}`, error);
      results.push({ org: org.slug, status: "failed", error: (error as Error).message });
    }
  }

  return NextResponse.json({ period, results });
}
