import { describe, it, expect, vi } from "vitest";
import { handleAssetRequest, type FetchLike } from "../asset-protocol";

function mockFetch(handler: (url: string, init?: RequestInit) => Response): FetchLike {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
}

describe("handleAssetRequest", () => {
  it("returns 503 when apiPort is null", async () => {
    const resp = await handleAssetRequest(
      new Request("beatos-asset://cover/1"),
      { apiPort: () => null, fetchImpl: mockFetch(() => new Response()) }
    );
    expect(resp.status).toBe(503);
  });

  it("returns 404 for unknown host", async () => {
    const resp = await handleAssetRequest(
      new Request("beatos-asset://unknown/1"),
      { apiPort: () => 8000, fetchImpl: mockFetch(() => new Response()) }
    );
    expect(resp.status).toBe(404);
  });

  it("dispatches cover to /api/assets/cover/<id>", async () => {
    const f = mockFetch((url) => {
      expect(url).toBe("http://127.0.0.1:8000/api/assets/cover/42");
      return new Response("ok", { status: 200, headers: { "content-type": "image/png" } });
    });
    const resp = await handleAssetRequest(
      new Request("beatos-asset://cover/42"),
      { apiPort: () => 8000, fetchImpl: f }
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("image/png");
  });

  it("dispatches audio to /api/assets/audio/<id>", async () => {
    const f = mockFetch((url) => {
      expect(url).toBe("http://127.0.0.1:8000/api/assets/audio/7");
      return new Response("ok", { status: 200, headers: { "content-type": "audio/wav" } });
    });
    const resp = await handleAssetRequest(
      new Request("beatos-asset://audio/7"),
      { apiPort: () => 8000, fetchImpl: f }
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("audio/wav");
  });

  it("forwards Range header and propagates 206 + content-range", async () => {
    const f = mockFetch((_url, init) => {
      const range = (init?.headers as Record<string, string>)?.range;
      expect(range).toBe("bytes=0-1023");
      return new Response("partial", {
        status: 206,
        headers: {
          "content-type": "audio/wav",
          "content-range": "bytes 0-1023/2048",
          "accept-ranges": "bytes",
        },
      });
    });
    const req = new Request("beatos-asset://audio/7", {
      headers: { range: "bytes=0-1023" },
    });
    const resp = await handleAssetRequest(req, { apiPort: () => 8000, fetchImpl: f });
    expect(resp.status).toBe(206);
    expect(resp.headers.get("content-range")).toBe("bytes 0-1023/2048");
    expect(resp.headers.get("accept-ranges")).toBe("bytes");
  });
});
