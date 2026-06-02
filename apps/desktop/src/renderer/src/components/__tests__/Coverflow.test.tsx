// src/renderer/src/components/__tests__/Coverflow.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { Coverflow } from "@/components/Coverflow";
import { useTrackStore } from "@/stores/tracks";
import type { Track } from "@/api/tracks";

function track(id: number, title: string): Track {
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
    has_audio: true,
    cover_asset_id: id * 10,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    deleted_at: null,
  };
}

describe("Coverflow", () => {
  beforeEach(() => {
    useTrackStore.setState({
      list: [track(1, "One"), track(2, "Two"), track(3, "Three")],
      current: track(2, "Two"),
    } as never);
  });

  it("renders a cover per windowed track and marks the focused one active", () => {
    render(<Coverflow panelWidth={360} />);
    const active = screen.getByTestId("coverflow-cover-2");
    expect(active.getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("coverflow-cover-1")).toBeTruthy();
    expect(screen.getByTestId("coverflow-cover-3")).toBeTruthy();
  });

  it("clicking a side cover calls select() with that track id", () => {
    render(<Coverflow panelWidth={360} />);
    fireEvent.click(screen.getByTestId("coverflow-cover-3"));
    expect(useTrackStore.getState().current?.id).toBe(3);
  });

  it("ArrowRight on the stage advances focus to the next track", () => {
    render(<Coverflow panelWidth={360} />);
    fireEvent.keyDown(screen.getByTestId("coverflow-stage"), { key: "ArrowRight" });
    expect(useTrackStore.getState().current?.id).toBe(3);
  });

  it("renders no covers when the list is empty / no current", () => {
    useTrackStore.setState({ list: [], current: null } as never);
    render(<Coverflow panelWidth={360} />);
    expect(screen.queryByTestId("coverflow-cover-1")).toBeNull();
    expect(screen.getByTestId("coverflow-stage")).toBeTruthy();
  });
});
