import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/tracks", () => ({
  tracks: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { useTrackStore } from "../tracks";
import { useSourceStore } from "../sources";
import { tracks } from "@/api/tracks";

describe("useTrackStore source filter", () => {
  beforeEach(() => {
    (tracks.list as ReturnType<typeof vi.fn>).mockReset();
    useTrackStore.setState({ list: [], current: null, loading: false });
    useSourceStore.setState({ all: [], activeFilter: null });
  });

  it("refresh passes activeFilter to tracks.list", async () => {
    useSourceStore.setState({ activeFilter: 7 });
    (tracks.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await useTrackStore.getState().refresh();
    expect(tracks.list).toHaveBeenCalledWith({ source_id: 7 });
  });

  it("refresh omits source_id when filter is null", async () => {
    useSourceStore.setState({ activeFilter: null });
    (tracks.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await useTrackStore.getState().refresh();
    expect(tracks.list).toHaveBeenCalledWith({});
  });
});
