import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VirtualTrackList } from "@/components/VirtualTrackList";
import type { Track } from "@/api/tracks";

function makeTracks(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    library_id: 1,
    title: `Track ${i + 1}`,
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
    platform_data: null,
    created_at: "2026-05-14T00:00:00Z",
    updated_at: "2026-05-14T00:00:00Z",
    deleted_at: null,
  }));
}

describe("VirtualTrackList", () => {
  it("renders only visible rows for a 1000-row list", () => {
    const tracks = makeTracks(1000);
    const { container } = render(
      <VirtualTrackList
        tracks={tracks}
        renderRow={(t) => <div data-testid="row">{t.title}</div>}
      />,
    );
    const rows = container.querySelectorAll('[data-testid="row"]');
    // jsdom has 0 layout, so virtualizer fallback may render very few or none.
    // The important assertion: it doesn't render all 1000 (would be visible
    // as performance proof if not virtualized).
    expect(rows.length).toBeLessThan(1000);
  });

  it("calls onBackgroundClick when the scroll background itself is clicked", () => {
    const onBackgroundClick = vi.fn();
    const { container } = render(
      <VirtualTrackList
        tracks={makeTracks(3)}
        onBackgroundClick={onBackgroundClick}
        renderRow={(t) => <div data-testid="row">{t.title}</div>}
      />,
    );
    const scroller = container.querySelector(".beatos-scroll") as HTMLElement;
    fireEvent.click(scroller); // target === currentTarget (empty background)
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onBackgroundClick when a child (row area) is clicked", () => {
    const onBackgroundClick = vi.fn();
    const { container } = render(
      <VirtualTrackList
        tracks={makeTracks(3)}
        onBackgroundClick={onBackgroundClick}
        renderRow={(t) => <div data-testid="row">{t.title}</div>}
      />,
    );
    const scroller = container.querySelector(".beatos-scroll") as HTMLElement;
    const inner = scroller.firstElementChild as HTMLElement; // sizing div, not the scroller
    fireEvent.click(inner); // bubbles up but target !== currentTarget
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});
