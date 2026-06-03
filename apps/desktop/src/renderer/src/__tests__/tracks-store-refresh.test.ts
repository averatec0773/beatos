import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the network call refresh() makes; everything else stays real.
vi.mock("@/api/tracks", async (orig) => {
  const actual = await orig<typeof import("@/api/tracks")>();
  return { ...actual, tracks: { ...actual.tracks, list: vi.fn() } };
});

import { useTrackStore } from "@/stores/tracks";
import { tracks as api, type Track } from "@/api/tracks";

const listMock = api.list as unknown as ReturnType<typeof vi.fn>;

function track(id: number, title = `T${id}`): Track {
  return {
    id,
    title,
    bpm: null,
    key_signature: null,
    genre: null,
    mood: null,
    tags: null,
    description: null,
    producer: null,
    is_free: false,
    project_path: null,
    has_audio: false,
    cover_asset_id: null,
    created_at: "2026-05-16",
    updated_at: "2026-05-16",
    deleted_at: null,
  };
}

describe("useTrackStore.refresh reconciles current against the new view", () => {
  beforeEach(() => {
    listMock.mockReset();
    useTrackStore.setState({
      list: [track(1), track(2), track(3)],
      current: track(2),
      loading: false,
      selectedIds: new Set(),
      anchorId: null,
    });
  });

  it("keeps current (swapping in the fresh object) when its track is still present", async () => {
    const fresh = track(2, "T2-renamed");
    listMock.mockResolvedValue([track(5), fresh, track(6)]);
    await useTrackStore.getState().refresh();
    const cur = useTrackStore.getState().current;
    expect(cur).not.toBeNull();
    expect(cur?.id).toBe(2);
    // Must be the object from the NEW list, not the stale one.
    expect(cur?.title).toBe("T2-renamed");
  });

  it("drops current to null when its track is absent from the new view", async () => {
    listMock.mockResolvedValue([track(7), track(8)]);
    await useTrackStore.getState().refresh();
    expect(useTrackStore.getState().current).toBeNull();
  });

  it("leaves current null when it was already null", async () => {
    useTrackStore.setState({ current: null });
    listMock.mockResolvedValue([track(1), track(2)]);
    await useTrackStore.getState().refresh();
    expect(useTrackStore.getState().current).toBeNull();
  });
});
