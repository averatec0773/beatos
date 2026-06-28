import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/publish", () => ({
  publishApi: {
    sessions: vi.fn().mockResolvedValue({ sessions: { netease: true } }),
    validateSessions: vi.fn().mockResolvedValue({ sessions: { netease: "expired" } }),
    jobs: vi.fn().mockResolvedValue({ jobs: [] }),
  },
}));

import { publishApi } from "@/api/publish";
import { usePublishCenterStore } from "@/stores/publish-center";

// In-memory localStorage (jsdom's here lacks a usable clear()).
const _ls: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => (k in _ls ? _ls[k] : null),
  setItem: (k: string, v: string) => {
    _ls[k] = String(v);
  },
  removeItem: (k: string) => {
    delete _ls[k];
  },
  clear: () => {
    for (const k of Object.keys(_ls)) delete _ls[k];
  },
});

describe("publish-center store", () => {
  beforeEach(() => {
    localStorage.clear();
    usePublishCenterStore.setState({ sessions: {}, validatedAt: {}, jobs: [], validating: false });
  });

  it("seeds existence into 'checking' for present platforms then validates to real state", async () => {
    await usePublishCenterStore.getState().loadSessions();
    expect(usePublishCenterStore.getState().sessions.netease).toBe("checking");
    await usePublishCenterStore.getState().validateSessions();
    expect(usePublishCenterStore.getState().sessions.netease).toBe("expired");
  });

  it("skips re-validation within the TTL, but a forced check still runs", async () => {
    // Seed a fresh cached 'valid' so the TTL guard short-circuits.
    usePublishCenterStore.setState({
      sessions: { netease: "valid" },
      validatedAt: { netease: Date.now() },
    });
    (publishApi.validateSessions as ReturnType<typeof vi.fn>).mockClear();

    await usePublishCenterStore.getState().validateSessions(); // not forced + fresh → skip
    expect(publishApi.validateSessions).not.toHaveBeenCalled();
    expect(usePublishCenterStore.getState().sessions.netease).toBe("valid");

    await usePublishCenterStore.getState().validateSessions(true); // forced → runs
    expect(publishApi.validateSessions).toHaveBeenCalledTimes(1);
    expect(usePublishCenterStore.getState().sessions.netease).toBe("expired");
  });

  it("refreshJobs stores the list", async () => {
    await usePublishCenterStore.getState().refreshJobs();
    expect(usePublishCenterStore.getState().jobs).toEqual([]);
  });

  it("markLoggedIn optimistically marks a platform valid + caches it, with no headless probe", () => {
    (publishApi.validateSessions as ReturnType<typeof vi.fn>).mockClear();
    const before = Date.now();

    usePublishCenterStore.getState().markLoggedIn("beatstars");

    const st = usePublishCenterStore.getState();
    expect(st.sessions.beatstars).toBe("valid");
    expect(st.validatedAt.beatstars).toBeGreaterThanOrEqual(before);
    // Login success is itself the validity proof — no re-probe is fired.
    expect(publishApi.validateSessions).not.toHaveBeenCalled();
    // Persisted so a remount keeps it "valid" within the TTL (no re-check needed).
    const cached = JSON.parse(localStorage.getItem("beatos.publish-center.sessions.v1") ?? "{}");
    expect(cached.beatstars).toEqual({ state: "valid", at: st.validatedAt.beatstars });
  });
});
