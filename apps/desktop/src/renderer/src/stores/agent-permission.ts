import { create } from "zustand";

import { appSettings } from "@/api/app-settings";

const KEY = "agent_permission_mode";

export type AgentPermissionMode = "confirm" | "auto_approve" | "read_only";

function isMode(v: unknown): v is AgentPermissionMode {
  return v === "confirm" || v === "auto_approve" || v === "read_only";
}

interface AgentPermissionState {
  mode: AgentPermissionMode;
  hydrate(): Promise<void>;
  setMode(v: AgentPermissionMode): Promise<void>;
}

export const useAgentPermissionStore = create<AgentPermissionState>((set) => ({
  mode: "confirm",
  async hydrate() {
    try {
      const r = await appSettings.get<AgentPermissionMode>(KEY);
      if (isMode(r.value)) {
        set({ mode: r.value });
      }
    } catch (e) {
      console.warn("[agent-permission] hydrate failed", e);
    }
  },
  async setMode(v) {
    set({ mode: v }); // optimistic — UI updates immediately
    try {
      await appSettings.set<AgentPermissionMode>(KEY, v);
    } catch (e) {
      console.error("[agent-permission] persist failed", e);
    }
  },
}));
