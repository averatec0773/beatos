import { beforeEach, describe, expect, it, vi } from "vitest";
import { sources } from "../sources";

vi.stubGlobal("fetch", vi.fn());

describe("sources API client", () => {
  beforeEach(() => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it("list returns parsed array", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 1, name: "Main", root_path: "/p", position: 0, created_at: "x", status: "online", track_count: 5 },
      ],
    });
    const result = await sources.list();
    expect(result[0].name).toBe("Main");
  });

  it("create posts root_path body", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "Main", root_path: "/p", position: 0, created_at: "x" }),
    });
    await sources.create({ root_path: "/p" });
    const call = mockFetch.mock.calls[0];
    expect(JSON.parse(call[1].body)).toEqual({ root_path: "/p" });
  });
});
