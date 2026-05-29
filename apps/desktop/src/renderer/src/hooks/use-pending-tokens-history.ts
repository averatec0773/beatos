import { useCallback, useEffect, useState } from "react";

import { useApiBase } from "@/hooks/use-api-base";
import type { PendingToken } from "@/hooks/use-pending-tokens";

export type HistoryToken = PendingToken & {
  status: "consumed" | "rejected" | "expired";
  consumed_at: number;
  result: Record<string, unknown> | null;
};

export function usePendingTokensHistory(): { tokens: HistoryToken[] } {
  const apiBase = useApiBase();
  const [tokens, setTokens] = useState<HistoryToken[]>([]);

  const fetchHistory = useCallback(async () => {
    if (!apiBase) return;
    const res = await fetch(`${apiBase}/api/tokens?status=history`);
    if (res.ok) {
      setTokens(await res.json());
    }
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    void fetchHistory();
    const es = new EventSource(`${apiBase}/api/tokens/stream`);
    es.addEventListener("pending_changed", () => {
      void fetchHistory();
    });
    es.onerror = () => {
      /* EventSource auto-reconnects */
    };
    return () => es.close();
  }, [apiBase, fetchHistory]);

  return { tokens };
}
