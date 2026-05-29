import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

// Mock window.beatos so onDragStart in the panel doesn't crash
vi.stubGlobal("beatos", { startDragFile: vi.fn() });

// Mock CoverImage to avoid beatos-asset:// network requests
vi.mock("@/components/CoverImage", () => ({
  CoverImage: () => null,
}));

import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { usePreviewPanelStore } from "@/stores/preview-panel";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { TrackDetailPanel } from "@/routes/TrackDetailPanel";
import type { Track } from "@/api/tracks";

function makeTrack(): Track {
  return {
    id: 42,
    title: "Test Beat",
    producer: ["DJ Test"],
    genre: ["Trap Rap"],
    mood: ["Dark"],
    bpm: 140,
    key_signature: "Am",
    has_audio: false,
    cover_asset_id: null,
    tags: [],
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };
}

describe("TrackDetailPanel genre/mood locale", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
    useTrackStore.setState({ current: makeTrack() });
    useAssetStore.setState({ byTrack: {} });
    usePreviewPanelStore.setState({ open: true, width: 360 });
  });

  it("shows bilingual genre label under 'both' locale", () => {
    render(<TrackDetailPanel />);
    const matches = screen.getAllByText("陷阱说唱 (Trap Rap)");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Chinese-only genre label under 'zh' locale", () => {
    act(() => useVocabLocaleStore.setState({ locale: "zh" }));
    render(<TrackDetailPanel />);
    const matches = screen.getAllByText("陷阱说唱");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
