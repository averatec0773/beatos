import { useCallback, useEffect, useState } from "react";

import { apiPost } from "@/api/client";
import { useApiBase } from "@/hooks/use-api-base";
import { useListStore } from "@/stores/lists";
import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";

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
      // Via the client so the local API token rides along (the approve endpoint
      // is token-gated in Electron — it's the human-in-the-loop gate).
      await apiPost(`/api/tokens/${token}/approve`).catch((e) =>
        console.warn("[approvals] approve failed", e),
      );
      // The approval mutated server-side state this hook does not own. Invalidate
      // every renderer cache an MCP write can touch: curation lists, the track
      // library (title/bpm/has_audio/cover), and per-track assets. The asset
      // bump is what un-stales the player's RoleSwitcher — without it, an
      // MCP-attached format stays unswitchable/unhighlighted until a restart.
      // Guarded so a refresh failure never rejects the approval itself.
      await Promise.all([
        useListStore.getState().refresh(),
        useTrackStore.getState().refresh(),
      ]).catch((e) => console.warn("[approvals] post-approve refresh failed", e));
      useAssetStore.getState().bump();
    },
    [apiBase],
  );

  const reject = useCallback(
    async (token: string) => {
      if (!apiBase) return;
      await apiPost(`/api/tokens/${token}/reject`).catch((e) =>
        console.warn("[approvals] reject failed", e),
      );
    },
    [apiBase],
  );

  return { tokens, approve, reject };
}
