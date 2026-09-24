import { Badge } from "@/components/ui/badge";
import type { TokenStatus } from "@/server/domain/billing";

const LABEL: Record<TokenStatus, string> = { paid: "Paid", partial: "Partly paid", unpaid: "Unpaid" };
const VARIANT = { paid: "success", partial: "secondary", unpaid: "destructive" } as const;

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
