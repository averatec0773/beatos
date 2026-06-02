import { beforeEach, describe, expect, it } from "vitest";
import { useTrackStore } from "@/stores/tracks";
import type { Track } from "@/api/tracks";

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

describe("useTrackStore selection", () => {
  beforeEach(() => {
    useTrackStore.setState({
      list: [track(1), track(2), track(3), track(4), track(5)],
      current: null,
      loading: false,
      selectedIds: new Set(),
      anchorId: null,
    });
  });

  it("selectOne replace: keeps just one id", () => {
    useTrackStore.getState().selectOne(2, "replace");
    expect(Array.from(useTrackStore.getState().selectedIds)).toEqual([2]);
    expect(useTrackStore.getState().anchorId).toBe(2);
  });

  it("selectOne toggle: adds then removes", () => {
    useTrackStore.getState().selectOne(2, "replace");
    useTrackStore.getState().selectOne(4, "toggle");
    expect(new Set(useTrackStore.getState().selectedIds)).toEqual(new Set([2, 4]));
    useTrackStore.getState().selectOne(4, "toggle");
    expect(new Set(useTrackStore.getState().selectedIds)).toEqual(new Set([2]));
  });

  it("selectOne range: selects inclusive from anchor", () => {
    useTrackStore.getState().selectOne(2, "replace");
    useTrackStore.getState().selectOne(5, "range");
    expect(new Set(useTrackStore.getState().selectedIds)).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selectOne range without anchor: falls back to replace", () => {
    useTrackStore.setState({ anchorId: null });
    useTrackStore.getState().selectOne(3, "range");
    expect(new Set(useTrackStore.getState().selectedIds)).toEqual(new Set([3]));
  });

  it("clearSelection empties the set", () => {
    useTrackStore.getState().selectOne(1, "replace");
    useTrackStore.getState().selectOne(2, "toggle");
    useTrackStore.getState().clearSelection();
    expect(useTrackStore.getState().selectedIds.size).toBe(0);
    expect(useTrackStore.getState().anchorId).toBeNull();
  });
});
