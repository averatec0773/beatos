import React from "react";

import { PendingCard } from "@/components/Approvals/PendingCard";
import type { PendingToken } from "@/hooks/use-pending-tokens";

interface Props {
  tokens: PendingToken[];
  onApprove: (token: string) => void | Promise<void>;
  onReject: (token: string) => void | Promise<void>;
}

export function PendingList({ tokens, onApprove, onReject }: Props): React.JSX.Element | null {
  if (tokens.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-medium text-warning">
        ⚠ Pending ({tokens.length})
      </h2>
      <ul className="space-y-2">
        {tokens.map((t) => (
          <PendingCard
            key={t.token}
            token={t}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </ul>
    </section>
  );
}
