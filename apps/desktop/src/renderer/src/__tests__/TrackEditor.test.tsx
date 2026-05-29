import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TrackEditor } from "@/routes/TrackEditor";
import { useTrackStore } from "@/stores/tracks";
import { sampleTrack } from "@/test/fixtures";
import { tracks } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";

describe("TrackEditor (auto-save)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("auto-saves after the debounce window once title is non-empty", async () => {
    vi.spyOn(tracks, "get").mockResolvedValue(sampleTrack);
    vi.spyOn(assetsApi, "listForTrack").mockResolvedValue([]);
    const update = vi
      .fn()
      .mockImplementation(async (_id: number, payload: Record<string, unknown>) => ({
        ...sampleTrack,
        ...payload,
      }));
    useTrackStore.setState({ update });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter initialEntries={["/tracks/1/edit"]}>
        <Routes>
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    const titleInput = await screen.findByDisplayValue("Untitled");
    await user.clear(titleInput);
    await user.type(titleInput, "NewTitle");

    // Advance past the 800ms debounce so the auto-save effect fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect((update.mock.calls[0][1] as { title: string }).title).toBe("NewTitle");
    await waitFor(() => screen.getByText(/saved/i));
  });

  it("does not auto-save when the title is empty (and surfaces the requirement)", async () => {
    vi.spyOn(tracks, "get").mockResolvedValue(sampleTrack);
    vi.spyOn(assetsApi, "listForTrack").mockResolvedValue([]);
    const update = vi.fn().mockResolvedValue(sampleTrack);
    useTrackStore.setState({ update });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter initialEntries={["/tracks/1/edit"]}>
        <Routes>
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    const titleInput = await screen.findByDisplayValue(sampleTrack.title);
    await user.clear(titleInput);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/title required to save/i)).toBeInTheDocument();
  });

  it("does not fire save when nothing changed from the loaded baseline", async () => {
    vi.spyOn(tracks, "get").mockResolvedValue(sampleTrack);
    vi.spyOn(assetsApi, "listForTrack").mockResolvedValue([]);
    const update = vi.fn().mockResolvedValue(sampleTrack);
    useTrackStore.setState({ update });

    render(
      <MemoryRouter initialEntries={["/tracks/1/edit"]}>
        <Routes>
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByDisplayValue(sampleTrack.title);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("does NOT auto-retry after a failed save (avoids tight retry loop)", async () => {
    vi.spyOn(tracks, "get").mockResolvedValue(sampleTrack);
    vi.spyOn(assetsApi, "listForTrack").mockResolvedValue([]);
    const update = vi.fn().mockRejectedValue(new Error("sidecar down"));
    useTrackStore.setState({ update });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter initialEntries={["/tracks/1/edit"]}>
        <Routes>
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    const titleInput = await screen.findByDisplayValue("Untitled");
    await user.clear(titleInput);
    await user.type(titleInput, "EditA");

    // First save attempt (after debounce) — should fail.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(() => screen.getByRole("button", { name: /save failed/i }));

    // Type more — auto-save MUST stay paused until user retries.
    await user.type(titleInput, "B");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(update).toHaveBeenCalledTimes(1); // no auto-retry
  });
});
