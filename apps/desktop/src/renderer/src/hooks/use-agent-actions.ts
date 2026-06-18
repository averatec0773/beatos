import { useEffect, useState } from "react";

import { useApiBase } from "@/hooks/use-api-base";

export type AgentActionStatus = "applied" | "failed" | "refused_read_only";

export interface AgentActionSummary {
  headline?: string;
  sample?: string[];
  warnings?: string[];
  risk?: string;
}

export interface AgentAction {
  ts: number;
  tool_name: string;
  summary: AgentActionSummary;
  client_name: string;
  status: AgentActionStatus;
  result: Record<string, unknown> | string;
}

const POLL_INTERVAL_MS = 4000;

export function useAgentActions(): { actions: AgentAction[] } {
  const apiBase = useApiBase();
  const [actions, setActions] = useState<AgentAction[]>([]);

  useEffect(() => {
    if (!apiBase) return;
    let cancelled = false;

    const fetchActions = async (): Promise<void> => {
      const res = await fetch(`${apiBase}/api/agent-actions`).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const data = await res.json().catch(() => null);
      if (cancelled || !data) return;
      setActions(data.actions ?? []);
    };

    void fetchActions();
    const id = setInterval(() => void fetchActions(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiBase]);

  return { actions };
}
