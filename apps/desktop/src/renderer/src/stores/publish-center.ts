import { create } from "zustand";

import i18n from "@/i18n";
import {
  publishApi,
  type PublishJobFull,
  type SessionState,
  type ValidatedSessionState,
} from "@/api/publish";
import { useToastStore } from "@/stores/toast";

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
   *  force=true (manual refresh). */
  validateSessions(force?: boolean): Promise<void>;
  /** Optimistically record a just-completed login as valid. */
  markLoggedIn(platform: string): void;
  refreshJobs(): Promise<void>;
  /** Delete one publish-job record, then refresh the list. */
  deleteJob(jobId: string): Promise<void>;
  /** Clear all publish-job records, then refresh the list. */
  clearJobs(): Promise<void>;
}

// Dedupe overlapping validate calls (e.g. React StrictMode's dev double-mount, or
// the mount effect racing a manual refresh) so we never fan out two batches of
// headless checks for the same request.
let _validateInflight: Promise<void> | null = null;

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
    if (_validateInflight) return _validateInflight; // collapse concurrent calls
    const current = get().sessions;
    // loadSessions marks a platform 'checking' iff it is present AND its expensive
    // result is stale/never. So 'checking' is exactly the set that needs a headless
    // hit — only those go to the browser (a forced refresh re-checks everything).
    const toCheck = force
      ? Object.keys(current)
      : Object.keys(current).filter((p) => current[p] === "checking");
    if (toCheck.length === 0) return;
    const run = (async () => {
      set({ validating: true });
      const now = Date.now();
      try {
        const { sessions } = await publishApi.validateSessions(toCheck);
        const prev = get().sessions;
        const at = { ...get().validatedAt };
        const cache = loadCache();
        const next: Record<string, SessionState> = { ...prev };
        for (const [p, st] of Object.entries(sessions)) {
          if (st === "unknown") {
            // Indeterminate (transient nav/timeout): keep the last real state and do
            // NOT refresh the TTL, so the next load re-checks instead of caching a
            // non-answer for 24h. Never downgrade a logged-in account on a blip.
            next[p] = prev[p] && prev[p] !== "checking" ? prev[p] : "unknown";
            continue;
          }
          next[p] = st;
          if (st === "not_logged_in") {
            // Free (file-existence) result — re-derived each loadSessions, so it
            // must never consume the expensive-check TTL.
            delete at[p];
            delete cache[p];
            continue;
          }
          at[p] = now;
          cache[p] = { state: st, at: now };
        }
        saveCache(cache);
        set({ sessions: next, validatedAt: at });
      } catch (e) {
        console.warn("[publish-center] validateSessions failed", e);
        // Don't strand rows at 'checking' — drop them to 'unknown' (keeping any
        // prior real state) and tell the user the check itself failed.
        const prev = get().sessions;
        const next: Record<string, SessionState> = { ...prev };
        for (const p of Object.keys(next)) if (next[p] === "checking") next[p] = "unknown";
        set({ sessions: next });
        useToastStore.getState().show("error", i18n.t("publishCenter.couldntCheckStatus"));
      } finally {
        set({ validating: false });
      }
    })();
    _validateInflight = run.finally(() => {
      _validateInflight = null;
    });
    return _validateInflight;
  },
  markLoggedIn(platform) {
    // The login flow resolves only AFTER the engine observed the platform's
    // authed-only ready_marker in the real login browser — a first-party proof
    // the session is valid. Trust it directly instead of firing a second, cold
    // headless re-probe: that probe can race a login→OAuth redirect (BeatStars
    // bounces studio.* through oauth.* until the session warms) and come back
    // 'unknown'/'expired', leaving the row stranded at its pre-login state until
    // the user navigates away and back. Persist to the cache so a remount keeps
    // it 'valid' within the TTL.
    const now = Date.now();
    const cache = loadCache();
    cache[platform] = { state: "valid", at: now };
    saveCache(cache);
    set({
      sessions: { ...get().sessions, [platform]: "valid" },
      validatedAt: { ...get().validatedAt, [platform]: now },
    });
  },
  async refreshJobs() {
    try {
      const { jobs } = await publishApi.jobs();
      set({ jobs });
    } catch (e) {
      console.warn("[publish-center] refreshJobs failed", e);
    }
  },
  async deleteJob(jobId) {
    // Optimistic removal so the row vanishes immediately; refresh reconciles.
    set({ jobs: get().jobs.filter((j) => j.job_id !== jobId) });
    try {
      await publishApi.deleteJob(jobId);
    } catch (e) {
      console.warn("[publish-center] deleteJob failed", e);
      useToastStore.getState().show("error", i18n.t("publishCenter.deleteFailed"));
    } finally {
      await get().refreshJobs();
    }
  },
  async clearJobs() {
    set({ jobs: [] });
    try {
      await publishApi.clearJobs();
    } catch (e) {
      console.warn("[publish-center] clearJobs failed", e);
      useToastStore.getState().show("error", i18n.t("publishCenter.deleteFailed"));
    } finally {
      await get().refreshJobs();
    }
  },
}));
