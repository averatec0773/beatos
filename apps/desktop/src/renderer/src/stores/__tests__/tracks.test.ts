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
import { useTrackQueryStore } from "../track-query";
import { tracks } from "@/api/tracks";

describe("useTrackStore refresh", () => {
  beforeEach(() => {
    (tracks.list as ReturnType<typeof vi.fn>).mockReset();
    useTrackStore.setState({ list: [], current: null, loading: false });
    useTrackQueryStore.setState({
      sortBy: "updated_at",
      sortDir: "desc",
      filters: {
        producers: [],
        genres: [],
        moods: [],
        keys: [],
        bpm_min: null,
        bpm_max: null,
        has_audio: null,
      },
    });
  });

  it("refresh forwards sort_by and sort_dir for library view", async () => {
    useTrackQueryStore.setState({ sortBy: "title", sortDir: "asc" });
    (tracks.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await useTrackStore.getState().refresh();
    expect(tracks.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort_by: "title", sort_dir: "asc" }),
    );
  });

  it("refresh omits sort_by when list_id is provided", async () => {
    // Set sort state — note: subscription may fire, so provide enough mock returns
    (tracks.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useTrackQueryStore.setState({ sortBy: "title", sortDir: "asc" });
    // Reset call history after subscription-triggered refresh(es)
    (tracks.list as ReturnType<typeof vi.fn>).mockClear();
    (tracks.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await useTrackStore.getState().refresh({ list_id: 3 });
    const calls = (tracks.list as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    // The last explicit refresh is for list_id=3; find that call
    const listCall = calls.find((c) => (c[0] as Record<string, unknown>).list_id === 3);
    expect(listCall).toBeDefined();
    expect((listCall![0] as Record<string, unknown>).sort_by).toBeUndefined();
  });
});
