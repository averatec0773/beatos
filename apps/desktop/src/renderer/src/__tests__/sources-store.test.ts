import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceStore } from "@/stores/sources";
import * as api from "@/api/sources";

describe("useSourceStore loadError", () => {
  beforeEach(() => {
    useSourceStore.setState({ all: [], hasLoaded: false, loadError: null, activeFilter: null });
  });

  it("sets loadError when API throws, leaves all empty", async () => {
    vi.spyOn(api.sources, "list").mockRejectedValueOnce(new Error("API down"));
    await useSourceStore.getState().refresh();
    expect(useSourceStore.getState().hasLoaded).toBe(true);
    expect(useSourceStore.getState().loadError).not.toBeNull();
    expect(useSourceStore.getState().all).toEqual([]);
  });

  it("clears loadError on successful refresh", async () => {
    useSourceStore.setState({ loadError: new Error("stale") as any });
    vi.spyOn(api.sources, "list").mockResolvedValueOnce([]);
    await useSourceStore.getState().refresh();
    expect(useSourceStore.getState().loadError).toBeNull();
  });
});
