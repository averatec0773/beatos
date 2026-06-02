import { describe, it, expect } from "vitest";

import { isPristineNewTrack } from "@/lib/track-editor-helpers";
import type { Track } from "@/api/tracks";

function track(over: Partial<Track> = {}): Track {
  return {
    id: 1,
    title: "Untitled",
    bpm: null,
    key_signature: null,
    genre: null,
    mood: null,
    tags: null,
    description: null,
    producer: null,
    is_free: false,
    has_audio: false,
    cover_asset_id: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    deleted_at: null,
    ...over,
  };
}

describe("isPristineNewTrack", () => {
  it("is true for the freshly-created Untitled row with no content", () => {
    expect(isPristineNewTrack(track(), 0)).toBe(true);
    expect(isPristineNewTrack(track({ title: "  Untitled  " }), 0)).toBe(true);
    expect(isPristineNewTrack(track({ title: "" }), 0)).toBe(true);
  });

  it("is false once any content exists", () => {
    expect(isPristineNewTrack(track({ title: "My Beat" }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ bpm: 120 }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ key_signature: "F# minor" }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ genre: ["trap"] }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ mood: ["dark"] }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ tags: ["808"] }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ producer: ["lunaire"] }), 0)).toBe(false);
    expect(isPristineNewTrack(track({ description: "x" }), 0)).toBe(false);
  });

  it("is false when audio or any asset is attached", () => {
    expect(isPristineNewTrack(track({ has_audio: true }), 0)).toBe(false);
    expect(isPristineNewTrack(track(), 1)).toBe(false);
  });
});
