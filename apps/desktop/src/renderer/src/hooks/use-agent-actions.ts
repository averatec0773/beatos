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
  id: number;
  ts: number;
  tool_name: string;
  summary: AgentActionSummary;
  client_name: string;
  status: AgentActionStatus;
  result: Record<string, unknown> | string;
}

const POLL_INTERVAL_MS = 4000;

export interface UseAgentActions {
  actions: AgentAction[];
  deleteAction(id: number): Promise<void>;
  clearAll(): Promise<void>;
}

export function useAgentActions(): UseAgentActions {
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

  // Optimistically drop the row(s); the 4s poll reconciles with the server.
  const deleteAction = async (id: number): Promise<void> => {
    setActions((prev) => prev.filter((a) => a.id !== id));
    await fetch(`${apiBase}/api/agent-actions/${id}`, { method: "DELETE" }).catch(() => null);
  };
  const clearAll = async (): Promise<void> => {
    setActions([]);
    await fetch(`${apiBase}/api/agent-actions`, { method: "DELETE" }).catch(() => null);
  };

  return { actions, deleteAction, clearAll };
}
