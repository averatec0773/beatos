import { create } from "zustand";

import { appSettings } from "@/api/app-settings";

const KEY = "agent_permission_mode";

// Two honest modes (v0.0.49+). The pre-L1 values `confirm` and `auto_approve`
// both meant "writes apply" — they collapse to `enabled` here, matching the
// sidecar policy (beatos_mcp/policy.py maps the same legacy values).
export type AgentPermissionMode = "enabled" | "read_only";

function normalizeMode(v: unknown): AgentPermissionMode {
  if (v === "read_only") return "read_only";
  // "enabled" plus the legacy "confirm" / "auto_approve" → enabled.
  return "enabled";
}

interface AgentPermissionState {
  mode: AgentPermissionMode;
  hydrate(): Promise<void>;
  setMode(v: AgentPermissionMode): Promise<void>;
}

export const useAgentPermissionStore = create<AgentPermissionState>((set) => ({
  mode: "enabled",
  async hydrate() {
    try {
      const r = await appSettings.get<string>(KEY);
      // Only override the default when a value was actually stored; legacy values
      // are normalized so an old `confirm`/`auto_approve` shows as Enabled.
      if (r.value != null) set({ mode: normalizeMode(r.value) });
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
