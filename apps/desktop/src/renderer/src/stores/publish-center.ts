import { create } from "zustand";

import {
  publishApi,
  type PublishJobFull,
  type SessionState,
} from "@/api/publish";

interface PublishCenterState {
  sessions: Record<string, SessionState>;
  jobs: PublishJobFull[];
  validating: boolean;
  /** Cheap existence check → present platforms 'checking', absent 'not_logged_in'. */
  loadSessions(): Promise<void>;
  /** Real headless validity check → 'valid' | 'expired' | 'not_logged_in'. */
  validateSessions(): Promise<void>;
  refreshJobs(): Promise<void>;
}

export const usePublishCenterStore = create<PublishCenterState>((set) => ({
  sessions: {},
  jobs: [],
  validating: false,
  async loadSessions() {
    try {
      const { sessions } = await publishApi.sessions();
      const next: Record<string, SessionState> = {};
      for (const [p, present] of Object.entries(sessions)) {
        next[p] = present ? "checking" : "not_logged_in";
      }
      set({ sessions: next });
    } catch (e) {
      console.warn("[publish-center] loadSessions failed", e);
    }
  },
  async validateSessions() {
    set({ validating: true });
    try {
      const { sessions } = await publishApi.validateSessions();
      set({ sessions: { ...sessions } });
    } catch (e) {
      console.warn("[publish-center] validateSessions failed", e);
    } finally {
      set({ validating: false });
    }
  },
  async refreshJobs() {
    try {
      const { jobs } = await publishApi.jobs();
      set({ jobs });
    } catch (e) {
      console.warn("[publish-center] refreshJobs failed", e);
    }
  },
}));
