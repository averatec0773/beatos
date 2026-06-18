import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useAgentActions } from "@/hooks/use-agent-actions";

const FAKE_BASE = "http://127.0.0.1:5555";

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

const sampleAction = {
  ts: Date.now() / 1000 - 30,
  tool_name: "trash_tracks",
  summary: { headline: "Trashed 3 tracks" },
  client_name: "Claude Desktop",
  status: "applied" as const,
  result: { trashed: 3 },
};

function mockActions(actions: unknown[]) {
  (global.fetch as any) = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ actions }) }),
  );
}

describe("useAgentActions", () => {
  beforeEach(() => {
    mockActions([]);
  });

  it("performs an initial GET on mount", async () => {
    renderHook(() => useAgentActions());
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`${FAKE_BASE}/api/agent-actions`);
    });
  });

  it("populates actions from the response", async () => {
    mockActions([sampleAction]);
    const { result } = renderHook(() => useAgentActions());
    await waitFor(() => {
      expect(result.current.actions).toHaveLength(1);
    });
    expect(result.current.actions[0].summary.headline).toBe("Trashed 3 tracks");
  });

  it("defaults to an empty list when the response has no actions field", async () => {
    (global.fetch as any) = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    );
    const { result } = renderHook(() => useAgentActions());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current.actions).toEqual([]);
  });

  it("polls on an interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockActions([]);
    renderHook(() => useAgentActions());
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(4000);
    expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});
