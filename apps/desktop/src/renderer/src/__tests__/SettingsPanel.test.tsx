import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SettingsPanel } from "@/routes/SettingsPanel";
import { useSourceStore } from "@/stores/sources";
import { useTrackStore } from "@/stores/tracks";
import { distinct } from "@/api/distinct";
import { producers as producersApi } from "@/api/producers";

const FAKE_BASE = "http://127.0.0.1:5555";

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

vi.mock("@/stores/lists", () => ({
  useListStore: {
    getState: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
  },
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    useSourceStore.setState({
      all: [
        { id: 1, name: "Main", root_path: "/main", position: 0, created_at: "x", status: "online", track_count: 12 },
        { id: 2, name: "Archive", root_path: "/arch", position: 1, created_at: "x", status: "offline", track_count: 0 },
      ],
      activeFilter: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    useTrackStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) });
    vi.spyOn(distinct, "values").mockResolvedValue([]);
  });

  it("renders Storage and Sources sections", async () => {
    render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /^storage$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^sources$/i })).toBeInTheDocument();
  });

  it("lists each configured Source with status", () => {
    render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText(/online/i)).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("calls add when Add Source button is clicked", async () => {
    const add = vi.fn().mockResolvedValue({ id: 3 });
    useSourceStore.setState({ add });
    (window.beatos.openFolderDialog as any) = vi.fn().mockResolvedValue("/new/path");

    render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: /add source/i }));
    expect(add).toHaveBeenCalledWith({ root_path: "/new/path" });
  });

  describe("Producers section", () => {
    it("lists each distinct producer with a per-row Remove button", async () => {
      vi.spyOn(distinct, "values").mockResolvedValue(["Alice", "alice", "Bob"]);
      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);

      await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByTestId("producer-remove-Alice")).toBeInTheDocument();
      expect(screen.getByTestId("producer-remove-alice")).toBeInTheDocument();
      expect(screen.getByTestId("producer-remove-Bob")).toBeInTheDocument();
    });

    it("shows empty-state copy when there are no producers yet", async () => {
      vi.spyOn(distinct, "values").mockResolvedValue([]);
      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText(/no producers yet/i)).toBeInTheDocument());
    });

    it("Remove calls rewrite with to=null and refreshes the list", async () => {
      const refreshSpy = vi.spyOn(distinct, "values")
        .mockResolvedValueOnce(["Alice", "Bob"])
        .mockResolvedValueOnce(["Bob"]);
      const rewrite = vi.spyOn(producersApi, "rewrite").mockResolvedValue({ affected: 4 });
      const trackRefresh = vi.fn().mockResolvedValue(undefined);
      useTrackStore.setState({ refresh: trackRefresh });

      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
      await waitFor(() => expect(screen.getByTestId("producer-remove-Alice")).toBeInTheDocument());

      await userEvent.click(screen.getByTestId("producer-remove-Alice"));

      await waitFor(() => expect(rewrite).toHaveBeenCalledWith(["Alice"], null));
      // Distinct list re-fetched after the rewrite
      await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(2));
      // Track store refreshed so any open list view picks up the change
      expect(trackRefresh).toHaveBeenCalled();
    });
  });
});
