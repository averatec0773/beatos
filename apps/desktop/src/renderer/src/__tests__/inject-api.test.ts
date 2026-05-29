import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/client", () => ({
  apiPost: vi.fn().mockResolvedValue({ ok: true }),
}));

import { apiPost } from "@/api/client";
import { injectApi } from "@/api/inject";

describe("injectApi.stage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs track_id + platform to /api/inject/stage", async () => {
    const r = await injectApi.stage(7, "netease");
    expect(apiPost).toHaveBeenCalledWith("/api/inject/stage", {
      track_id: 7,
      platform: "netease",
    });
    expect(r).toEqual({ ok: true });
  });
});
