import { create } from "zustand";

import {
  publishApi,
  type PublishJobFull,
  type SessionState,
  type ValidatedSessionState,
} from "@/api/publish";

// Real validity uses a headless browser hit to the platform's upload page, so
// it is both slow (~10-15s) and best kept infrequent (repeated automated loads
// are a small anti-bot risk). Cache the last result and only re-check when it is
// older than this TTL; a manual refresh always forces a fresh check. Persisted
// to localStorage so the TTL survives app restarts.
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LS_KEY = "beatos.publish-center.sessions.v1";

type CacheEntry = { state: ValidatedSessionState; at: number };
type Cache = Record<string, CacheEntry>;

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Cache): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

interface PublishCenterState {
  sessions: Record<string, SessionState>;
  /** ms-epoch of the last real validity check per platform (absent = never). */
  validatedAt: Record<string, number>;
  jobs: PublishJobFull[];
  validating: boolean;
  /** Cheap existence check; shows a fresh cached result, else 'checking'/'not_logged_in'. */
  loadSessions(): Promise<void>;
  /** Headless validity check. Skips platforms validated within the TTL unless
   *  force=true (manual refresh / post-login). */
  validateSessions(force?: boolean): Promise<void>;
  refreshJobs(): Promise<void>;
}

const _cache = loadCache();
const _initialSessions: Record<string, SessionState> = {};
const _initialValidatedAt: Record<string, number> = {};
for (const [p, e] of Object.entries(_cache)) {
  _initialSessions[p] = e.state;
  _initialValidatedAt[p] = e.at;
}

export const usePublishCenterStore = create<PublishCenterState>((set, get) => ({
  sessions: _initialSessions,
  validatedAt: _initialValidatedAt,
  jobs: [],
  validating: false,
  async loadSessions() {
    try {
      const { sessions } = await publishApi.sessions();
      const prev = get().sessions;
      const validatedAt = get().validatedAt;
      const now = Date.now();
      const next: Record<string, SessionState> = {};
      for (const [p, present] of Object.entries(sessions)) {
        if (!present) {
          next[p] = "not_logged_in";
        } else if (validatedAt[p] && now - validatedAt[p] < TTL_MS && prev[p]) {
          next[p] = prev[p]; // fresh cached real state — no headless hit needed
        } else {
          next[p] = "checking"; // present but stale / never validated
        }
      }
      set({ sessions: next });
    } catch (e) {
      console.warn("[publish-center] loadSessions failed", e);
    }
  },
  async validateSessions(force = false) {
    const now = Date.now();
    const validatedAt = get().validatedAt;
    const known = Object.keys(get().sessions);
    const stale = known.some((p) => !validatedAt[p] || now - validatedAt[p] > TTL_MS);
    if (!force && !stale) return; // all fresh → skip the headless check entirely
    set({ validating: true });
    try {
      const { sessions } = await publishApi.validateSessions();
      const at = { ...get().validatedAt };
      const cache = loadCache();
      for (const [p, st] of Object.entries(sessions)) {
        at[p] = now;
        cache[p] = { state: st, at: now };
      }
      saveCache(cache);
      set({ sessions: { ...sessions }, validatedAt: at });
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
