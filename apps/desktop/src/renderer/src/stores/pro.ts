import { create } from "zustand";

import { proApi } from "@/api/pro";

interface ProState {
  /** True only in the buyout build where the publish engine is present. */
  publishAvailable: boolean;
  /** True once a status response (success or error) has settled. */
  loaded: boolean;
  loadProStatus(): Promise<void>;
}

export const useProStore = create<ProState>((set) => ({
  publishAvailable: false,
  loaded: false,
  async loadProStatus() {
    try {
      const r = await proApi.status();
      set({ publishAvailable: Boolean(r.publish), loaded: true });
    } catch (e) {
      // Free build (no /api/pro/status) or transient failure: stay locked.
      console.warn("[pro] loadProStatus failed", e);
      set({ publishAvailable: false, loaded: true });
    }
  },
}));
