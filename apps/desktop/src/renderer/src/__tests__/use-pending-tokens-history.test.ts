import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { usePendingTokensHistory } from "@/hooks/use-pending-tokens-history";

const FAKE_BASE = "http://127.0.0.1:5555";

beforeEach(() => {
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
});

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

describe("usePendingTokensHistory", () => {
  it("performs initial GET on mount with status=history", async () => {
    renderHook(() => usePendingTokensHistory());
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${FAKE_BASE}/api/tokens?status=history`,
      );
    });
  });

  it("opens an EventSource on the stream URL", async () => {
    renderHook(() => usePendingTokensHistory());
    await waitFor(() => {
      const es = (window as any).__lastEventSource;
      expect(es?.url).toBe(`${FAKE_BASE}/api/tokens/stream`);
    });
  });

  it("re-fetches when pending_changed event arrives", async () => {
    renderHook(() => usePendingTokensHistory());
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const es = (window as any).__lastEventSource;
    act(() => { es.dispatch("pending_changed", JSON.stringify({ count: 0 })); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => usePendingTokensHistory());
    const es = (window as any).__lastEventSource;
    expect(es).not.toBeNull();
    unmount();
    expect((window as any).__lastEventSource).toBeNull();
  });

  it("populates tokens from the GET response", async () => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          token: "abc",
          tool_name: "create_list",
          payload: { name: "Trap" },
          created_at: 1000,
          expires_at: 1300,
          status: "consumed",
          consumed_at: 1100,
          result: { list_id: 7 },
        },
      ]),
    });
    const { result } = renderHook(() => usePendingTokensHistory());
    await waitFor(() => {
      expect(result.current.tokens).toHaveLength(1);
    });
    expect(result.current.tokens[0].status).toBe("consumed");
    expect(result.current.tokens[0].result).toEqual({ list_id: 7 });
  });
});
