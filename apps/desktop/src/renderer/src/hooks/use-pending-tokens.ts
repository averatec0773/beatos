import { useCallback, useEffect, useState } from "react";

import { useApiBase } from "@/hooks/use-api-base";
import { useListStore } from "@/stores/lists";

export type PendingToken = {
  token: string;
  tool_name: string;
  payload: Record<string, unknown>;
  created_at: number;
  expires_at: number;
};

export function usePendingTokens(): {
  tokens: PendingToken[];
  approve: (token: string) => Promise<void>;
  reject: (token: string) => Promise<void>;
} {
  const apiBase = useApiBase();
  const [tokens, setTokens] = useState<PendingToken[]>([]);

  const fetchPending = useCallback(async () => {
    if (!apiBase) return;
    const res = await fetch(`${apiBase}/api/tokens?status=pending`);
    if (res.ok) {
      setTokens(await res.json());
    }
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    void fetchPending();
    const es = new EventSource(`${apiBase}/api/tokens/stream`);
    es.addEventListener("pending_changed", () => {
      void fetchPending();
    });
    es.onerror = () => {
      /* EventSource auto-reconnects */
    };
    return () => es.close();
  }, [apiBase, fetchPending]);

  const approve = useCallback(
    async (token: string) => {
      if (!apiBase) return;
      await fetch(`${apiBase}/api/tokens/${token}/approve`, { method: "POST" });
      await useListStore.getState().refresh();
    },
    [apiBase],
  );

  const reject = useCallback(
    async (token: string) => {
      if (!apiBase) return;
      await fetch(`${apiBase}/api/tokens/${token}/reject`, { method: "POST" });
    },
    [apiBase],
  );

  return { tokens, approve, reject };
}
