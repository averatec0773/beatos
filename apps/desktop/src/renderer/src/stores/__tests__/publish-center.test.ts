import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/publish", () => ({
  publishApi: {
    sessions: vi.fn().mockResolvedValue({ sessions: { netease: true } }),
    validateSessions: vi.fn().mockResolvedValue({ sessions: { netease: "expired" } }),
    jobs: vi.fn().mockResolvedValue({ jobs: [] }),
  },
}));

import { usePublishCenterStore } from "@/stores/publish-center";

describe("publish-center store", () => {
  beforeEach(() => {
    usePublishCenterStore.setState({ sessions: {}, jobs: [], validating: false });
  });

  it("seeds existence into 'checking' for present platforms then validates to real state", async () => {
    await usePublishCenterStore.getState().loadSessions();
    expect(usePublishCenterStore.getState().sessions.netease).toBe("checking");
    await usePublishCenterStore.getState().validateSessions();
    expect(usePublishCenterStore.getState().sessions.netease).toBe("expired");
  });

  it("refreshJobs stores the list", async () => {
    await usePublishCenterStore.getState().refreshJobs();
    expect(usePublishCenterStore.getState().jobs).toEqual([]);
  });
});
