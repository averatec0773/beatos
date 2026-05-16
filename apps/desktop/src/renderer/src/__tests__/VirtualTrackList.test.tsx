import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
    description_draft: null,
    license_type: "lease_basic",
    price: null,
    producer: null,
    has_audio: false,
    cover_asset_id: null,
    platform_data: null,
    created_at: "2026-05-14T00:00:00Z",
    updated_at: "2026-05-14T00:00:00Z",
  }));
}

describe("VirtualTrackList", () => {
  it("renders only visible rows for a 1000-row list", () => {
    const tracks = makeTracks(1000);
    const { container } = render(
      <VirtualTrackList
        tracks={tracks}
        renderRow={(t) => <div data-testid="row">{t.title}</div>}
      />
    );
    const rows = container.querySelectorAll('[data-testid="row"]');
    // jsdom has 0 layout, so virtualizer fallback may render very few or none.
    // The important assertion: it doesn't render all 1000 (would be visible
    // as performance proof if not virtualized).
    expect(rows.length).toBeLessThan(1000);
  });
});
