import { Badge } from "@/components/ui/badge";
import type { TokenStatus } from "@/server/domain/billing";
import type { TokenState } from "@/server/domain/tokens";

const LABEL: Record<TokenStatus, string> = { paid: "Paid", partial: "Partly paid", unpaid: "Unpaid" };
const VARIANT = { paid: "success", partial: "secondary", unpaid: "destructive" } as const;

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}

const STATE_LABEL: Record<TokenState, string> = {
  paid: "Paid",
  partial: "Partly paid",
  unpaid: "Unpaid",
  carried: "Carried to newer token",
};
const STATE_VARIANT = { paid: "success", partial: "secondary", unpaid: "destructive", carried: "outline" } as const;

/** Paid / partly paid / unpaid, or "carried" for an older token whose unpaid money moved to the newest token. */
export function TokenStateBadge({ state }: { state: TokenState }) {
  return <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>;
}
