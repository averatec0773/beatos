import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/api/client";

describe("client base invalidation", () => {
  beforeEach(() => {
    client._resetBaseForTests();
    (window as any).beatos = {
      getApiBase: vi
        .fn()
        .mockResolvedValueOnce("http://1.1.1.1:5000")
        .mockResolvedValueOnce("http://2.2.2.2:5000"),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-fetches base after a network error", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(client.apiGet("/x")).rejects.toThrow();
    await client.apiGet("/x");
    expect((window as any).beatos.getApiBase).toHaveBeenCalledTimes(2);
  });
});
