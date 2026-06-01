import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { usePlayerStore } from "@/stores/player";

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
    is_free: false,
    has_audio: false,
    cover_asset_id: null,
    tags: [],
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };
}

describe("TrackDetailPanel vinyl playing state", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
    useTrackStore.setState({ current: makeTrack() }); // id 42
    useAssetStore.setState({ byTrack: {} });
    usePreviewPanelStore.setState({ open: true, width: 360 });
    usePlayerStore.setState({ currentTrackId: null, status: "idle" });
  });

  it("shows 'Now Focused' and disc not spinning when idle", () => {
    render(<TrackDetailPanel />);
    expect(screen.getByText("Now Focused")).toBeInTheDocument();
    const disc = document.querySelector("[data-vinyl-disc]");
    expect(disc).not.toHaveAttribute("data-playing", "true");
  });

  it("shows 'Now Playing' and marks disc playing when this track plays", () => {
    act(() => usePlayerStore.setState({ currentTrackId: 42, status: "playing" }));
    render(<TrackDetailPanel />);
    expect(screen.getByText("Now Playing")).toBeInTheDocument();
    const disc = document.querySelector("[data-vinyl-disc]");
    expect(disc).toHaveAttribute("data-playing", "true");
  });
});

describe("TrackDetailPanel hardware metadata", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
    useAssetStore.setState({ byTrack: {} });
    usePreviewPanelStore.setState({ open: true, width: 360 });
    usePlayerStore.setState({ currentTrackId: null, status: "idle" });
  });

  it("renders em-dash in the BPM LCD when bpm is null", () => {
    useTrackStore.setState({ current: { ...makeTrack(), bpm: null } });
    render(<TrackDetailPanel />);
    const bpm = document.querySelector('[data-stat="BPM"]');
    expect(bpm?.textContent).toContain("—");
  });

  it("renders one chip per genre + mood", () => {
    useTrackStore.setState({ current: makeTrack() }); // 1 genre + 1 mood, 0 tags
    render(<TrackDetailPanel />);
    expect(document.querySelectorAll("[data-chip]").length).toBe(2);
  });
});

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
