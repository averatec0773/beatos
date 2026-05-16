import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { TrackEditor } from "@/routes/TrackEditor";
import { useTrackStore } from "@/stores/tracks";
import { sampleTrack } from "@/test/fixtures";
import { tracks } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";

// useBlocker requires a data router which has JSDOM incompatibilities.
// Mock it to return "unblocked" state for unit tests; blocker behavior is
// covered by the smoke harness (Phase 4).
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useBlocker: () => ({ state: "unblocked", proceed: undefined, reset: undefined }),
  };
});

describe("TrackEditor", () => {
  it("requires a non-empty title to save", async () => {
    vi.spyOn(tracks, "get").mockResolvedValue({ ...sampleTrack, title: "" });
    vi.spyOn(assetsApi, "listForTrack").mockResolvedValue([]);
    const update = vi.fn().mockResolvedValue(sampleTrack);
    useTrackStore.setState({ update });

    render(
      <MemoryRouter initialEntries={["/tracks/1/edit"]}>
        <Routes>
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole("button", { name: /save/i }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it("saves and navigates back on Save with a title", async () => {
    vi.spyOn(tracks, "get").mockResolvedValue(sampleTrack);
    vi.spyOn(assetsApi, "listForTrack").mockResolvedValue([]);
    const update = vi.fn().mockResolvedValue(sampleTrack);
    useTrackStore.setState({ update });

    render(
      <MemoryRouter initialEntries={["/tracks/1/edit"]}>
        <Routes>
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
          <Route path="/" element={<div>list</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => screen.getByDisplayValue("Untitled"));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    await waitFor(() => screen.getByText("list"));
  });
});
