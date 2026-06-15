import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { usePendingTokens } from "@/hooks/use-pending-tokens";

const FAKE_BASE = "http://127.0.0.1:5555";

const { listRefresh, trackRefresh, assetBump } = vi.hoisted(() => ({
  listRefresh: vi.fn().mockResolvedValue(undefined),
  trackRefresh: vi.fn().mockResolvedValue(undefined),
  assetBump: vi.fn(),
}));

beforeEach(() => {
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
  listRefresh.mockClear();
  trackRefresh.mockClear();
  assetBump.mockClear();
});

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

vi.mock("@/stores/lists", () => ({
  useListStore: { getState: () => ({ refresh: listRefresh }) },
}));

vi.mock("@/stores/tracks", () => ({
  useTrackStore: { getState: () => ({ refresh: trackRefresh }) },
}));

vi.mock("@/stores/assets", () => ({
  useAssetStore: { getState: () => ({ bump: assetBump }) },
}));

describe("usePendingTokens", () => {
  it("performs initial GET on mount", async () => {
    renderHook(() => usePendingTokens());
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`${FAKE_BASE}/api/tokens?status=pending`);
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
    act(() => {
      es.dispatch("pending_changed", JSON.stringify({ count: 1 }));
    });
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
    await act(async () => {
      await result.current.approve("abc");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `${FAKE_BASE}/api/tokens/abc/approve`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("approve refreshes the track library and bumps the asset version", async () => {
    // An MCP write (attach_assets etc.) mutates server state the renderer caches
    // out-of-band of this hook. Without these, the library + the player's
    // RoleSwitcher stay stale until a restart (the bug: MCP-attached audio not
    // switchable/highlighted until relaunch).
    const { result } = renderHook(() => usePendingTokens());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await act(async () => {
      await result.current.approve("abc");
    });
    expect(trackRefresh).toHaveBeenCalled();
    expect(assetBump).toHaveBeenCalled();
  });

  it("reject calls POST", async () => {
    const { result } = renderHook(() => usePendingTokens());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    (global.fetch as any).mockClear();
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await act(async () => {
      await result.current.reject("xyz");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `${FAKE_BASE}/api/tokens/xyz/reject`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
