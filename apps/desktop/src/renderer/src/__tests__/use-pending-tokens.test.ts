import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { usePendingTokens } from "@/hooks/use-pending-tokens";

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

vi.mock("@/stores/lists", () => ({
  useListStore: {
    getState: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
  },
}));

describe("usePendingTokens", () => {
  it("performs initial GET on mount", async () => {
    renderHook(() => usePendingTokens());
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${FAKE_BASE}/api/tokens?status=pending`,
      );
    });
  });

  it("opens an EventSource on the stream URL", async () => {
    renderHook(() => usePendingTokens());
    await waitFor(() => {
      const es = (window as any).__lastEventSource;
      expect(es?.url).toBe(`${FAKE_BASE}/api/tokens/stream`);
    });
  });

  it("re-fetches when pending_changed event arrives", async () => {
    renderHook(() => usePendingTokens());
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const es = (window as any).__lastEventSource;
    act(() => { es.dispatch("pending_changed", JSON.stringify({ count: 1 })); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => usePendingTokens());
    const es = (window as any).__lastEventSource;
    expect(es).not.toBeNull();
    unmount();
    expect((window as any).__lastEventSource).toBeNull();
  });

  it("approve calls POST", async () => {
    const { result } = renderHook(() => usePendingTokens());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    (global.fetch as any).mockClear();
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await act(async () => { await result.current.approve("abc"); });
    expect(global.fetch).toHaveBeenCalledWith(
      `${FAKE_BASE}/api/tokens/abc/approve`,
      { method: "POST" },
    );
  });

  it("reject calls POST", async () => {
    const { result } = renderHook(() => usePendingTokens());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    (global.fetch as any).mockClear();
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await act(async () => { await result.current.reject("xyz"); });
    expect(global.fetch).toHaveBeenCalledWith(
      `${FAKE_BASE}/api/tokens/xyz/reject`,
      { method: "POST" },
    );
  });
});
