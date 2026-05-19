import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SettingsPanel } from "@/routes/SettingsPanel";
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
    useTrackStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) });
    vi.spyOn(distinct, "values").mockResolvedValue([]);
  });

  it("renders Storage section", async () => {
    render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /^storage$/i })).toBeInTheDocument();
  });

  it("no longer renders a Sources section", () => {
    render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: /^sources$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add source/i })).not.toBeInTheDocument();
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
