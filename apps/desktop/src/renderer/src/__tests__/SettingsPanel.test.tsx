import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SettingsPanel } from "@/routes/SettingsPanel";
import { useTrackStore } from "@/stores/tracks";
import { distinct } from "@/api/distinct";
import { producers as producersApi } from "@/api/producers";
import { appSettings } from "@/api/app-settings";

const FAKE_BASE = "http://127.0.0.1:5555";

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

vi.mock("@/stores/lists", () => ({
  useListStore: {
    getState: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock("@/stores/confirm-dialog", () => ({ confirmDialog: vi.fn().mockResolvedValue(true) }));

describe("SettingsPanel", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    useTrackStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) });
    vi.spyOn(distinct, "values").mockResolvedValue([]);
    // Default: no known_producers + no default_license_tiers stored.
    vi.spyOn(appSettings, "get").mockResolvedValue({ key: "", value: null } as any);
  });

  it("renders Storage section", async () => {
    render(
      <MemoryRouter>
        <SettingsPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /^storage$/i })).toBeInTheDocument();
  });

  it("no longer renders a Sources section", () => {
    render(
      <MemoryRouter>
        <SettingsPanel />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { name: /^sources$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add source/i })).not.toBeInTheDocument();
  });

  describe("Producers section", () => {
    it("renders each producer as a chip", async () => {
      vi.spyOn(distinct, "values").mockResolvedValue(["Alice", "alice", "Bob"]);
      render(
        <MemoryRouter>
          <SettingsPanel />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getAllByTestId("producer-chip")).toHaveLength(3));
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("shows empty-state copy when there are no producers yet", async () => {
      vi.spyOn(distinct, "values").mockResolvedValue([]);
      render(
        <MemoryRouter>
          <SettingsPanel />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByText(/No producers yet/i)).toBeInTheDocument());
    });

    it("Remove on a used producer calls rewrite + refreshes the list", async () => {
      const distinctSpy = vi
        .spyOn(distinct, "values")
        .mockResolvedValueOnce(["Alice", "Bob"])
        .mockResolvedValueOnce(["Bob"]);
      const rewrite = vi.spyOn(producersApi, "rewrite").mockResolvedValue({ affected: 4 });
      const trackRefresh = vi.fn().mockResolvedValue(undefined);
      useTrackStore.setState({ refresh: trackRefresh });
      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(
        <MemoryRouter>
          <SettingsPanel />
        </MemoryRouter>,
      );
      const aliceChip = await screen.findByText("Alice");
      const removeBtn = aliceChip.parentElement!.querySelector(
        '[aria-label="Remove Alice"]',
      ) as HTMLButtonElement;
      await userEvent.click(removeBtn);

      await waitFor(() => expect(rewrite).toHaveBeenCalledWith(["Alice"], null));
      // Distinct list re-fetched after the rewrite
      await waitFor(() => expect(distinctSpy).toHaveBeenCalledTimes(2));
      expect(trackRefresh).toHaveBeenCalled();
    });
  });
});
