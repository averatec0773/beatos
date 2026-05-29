import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { TrackRow } from "@/components/TrackRow";
import type { Track } from "@/api/tracks";

function makeTrack(): Track {
  return {
    id: 1,
    title: "T",
    producer: [],
    genre: ["Trap Rap"],
    mood: [],
    bpm: null,
    key_signature: null,
    has_audio: false,
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Track;
}

function renderRow() {
  return render(
    <DndContext>
      <TrackRow
        track={makeTrack()}
        coverAssetId={null}
        selected={false}
        onSelect={() => {}}
        onOpen={() => {}}
      />
    </DndContext>,
  );
}

describe("TrackRow genre label", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
  });

  it("shows bilingual genre under 'both'", () => {
    renderRow();
    expect(screen.getByText("陷阱说唱 (Trap Rap)")).toBeInTheDocument();
  });

  it("shows Chinese-only genre under 'zh'", () => {
    act(() => useVocabLocaleStore.setState({ locale: "zh" }));
    renderRow();
    expect(screen.getByText("陷阱说唱")).toBeInTheDocument();
  });
});
