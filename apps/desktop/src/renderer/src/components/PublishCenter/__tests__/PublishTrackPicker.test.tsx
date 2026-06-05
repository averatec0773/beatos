import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/tracks", () => ({
  tracks: {
    list: vi.fn().mockResolvedValue([
      { id: 1, title: "Beat One", bpm: 140 },
      { id: 2, title: "Beat Two", bpm: null },
    ]),
  },
}));

import { PublishTrackPicker } from "@/components/PublishCenter/PublishTrackPicker";

describe("PublishTrackPicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("lists tracks and calls onPick when one is chosen", async () => {
    const onPick = vi.fn();
    render(<PublishTrackPicker open onClose={vi.fn()} onPick={onPick} />);
    await vi.advanceTimersByTimeAsync(250); // pass the debounce + resolve the fetch
    const row = await screen.findByRole("button", { name: /Beat One/ });
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("shows the empty state when search returns nothing", async () => {
    const { tracks } = await import("@/api/tracks");
    (tracks.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    render(<PublishTrackPicker open onClose={vi.fn()} onPick={vi.fn()} />);
    await vi.advanceTimersByTimeAsync(250);
    expect(await screen.findByText(/No tracks found/)).toBeInTheDocument();
  });
});
