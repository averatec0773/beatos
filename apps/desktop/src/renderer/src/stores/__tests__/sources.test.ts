import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceStore } from "../sources";

vi.mock("@/api/sources", () => ({
  sources: {
    list: vi.fn().mockResolvedValue([
      { id: 1, name: "A", root_path: "/a", position: 0, created_at: "x", status: "online", track_count: 5 },
    ]),
    create: vi.fn().mockResolvedValue({
      id: 2, name: "B", root_path: "/b", position: 1, created_at: "x",
    }),
  },
}));

describe("sources store", () => {
  beforeEach(() => {
    useSourceStore.setState({ all: [], activeFilter: null });
  });

  it("refresh populates all", async () => {
    await useSourceStore.getState().refresh();
    expect(useSourceStore.getState().all).toHaveLength(1);
  });

  it("setFilter toggles single Source", () => {
    useSourceStore.getState().setFilter(1);
    expect(useSourceStore.getState().activeFilter).toBe(1);
    useSourceStore.getState().setFilter(null);
    expect(useSourceStore.getState().activeFilter).toBeNull();
  });
});
