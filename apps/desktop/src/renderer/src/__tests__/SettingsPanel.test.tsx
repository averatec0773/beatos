import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SettingsPanel } from "@/routes/SettingsPanel";
import { useSourceStore } from "@/stores/sources";
import { useTrackStore } from "@/stores/tracks";
import { distinct } from "@/api/distinct";
import { producers as producersApi } from "@/api/producers";

describe("SettingsPanel", () => {
  beforeEach(() => {
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
    it("renders distinct producer list and gates buttons by selection count", async () => {
      vi.spyOn(distinct, "values").mockResolvedValue(["Alice", "alice", "Bob"]);
      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);

      await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();

      // No selection → no action buttons visible
      expect(screen.queryByTestId("producer-rename-btn")).not.toBeInTheDocument();

      // Select one → rename + delete enabled, merge disabled
      await userEvent.click(screen.getAllByRole("checkbox")[0]);
      expect(screen.getByTestId("producer-rename-btn")).not.toBeDisabled();
      expect(screen.getByTestId("producer-merge-btn")).toBeDisabled();
      expect(screen.getByTestId("producer-delete-btn")).not.toBeDisabled();

      // Select another → merge becomes enabled, rename disabled
      await userEvent.click(screen.getAllByRole("checkbox")[1]);
      expect(screen.getByTestId("producer-rename-btn")).toBeDisabled();
      expect(screen.getByTestId("producer-merge-btn")).not.toBeDisabled();
    });

    it("rename flow: preview → confirm → rewrite → refresh", async () => {
      vi.spyOn(distinct, "values")
        .mockResolvedValueOnce(["Alice", "alicia"])
        .mockResolvedValueOnce(["Alice"]); // after rename
      vi.spyOn(producersApi, "preview").mockResolvedValue({ affected: 3 });
      const rewrite = vi.spyOn(producersApi, "rewrite").mockResolvedValue({ affected: 3 });

      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText("alicia")).toBeInTheDocument());

      // Select "alicia" (index 1 alphabetically: Alice, alicia)
      await userEvent.click(screen.getAllByRole("checkbox")[1]);
      await userEvent.click(screen.getByTestId("producer-rename-btn"));

      const input = await screen.findByTestId("producer-rename-input");
      await userEvent.clear(input);
      await userEvent.type(input, "Alice");
      await userEvent.click(screen.getByTestId("producer-rename-submit"));

      // Confirm dialog appears with affected count
      const body = await screen.findByTestId("producer-confirm-body");
      expect(body.textContent).toMatch(/3/);
      await userEvent.click(screen.getByTestId("producer-confirm-commit"));

      await waitFor(() => expect(rewrite).toHaveBeenCalledWith(["alicia"], "Alice"));
    });

    it("delete flow: skips name dialog, goes straight to confirmation", async () => {
      vi.spyOn(distinct, "values")
        .mockResolvedValueOnce(["Bob"])
        .mockResolvedValueOnce([]);
      vi.spyOn(producersApi, "preview").mockResolvedValue({ affected: 2 });
      const rewrite = vi.spyOn(producersApi, "rewrite").mockResolvedValue({ affected: 2 });

      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
      await userEvent.click(screen.getAllByRole("checkbox")[0]);
      await userEvent.click(screen.getByTestId("producer-delete-btn"));

      await screen.findByTestId("producer-confirm-commit");
      await userEvent.click(screen.getByTestId("producer-confirm-commit"));

      await waitFor(() => expect(rewrite).toHaveBeenCalledWith(["Bob"], null));
    });

    it("merge flow: requires 2+ selected, default target is first", async () => {
      vi.spyOn(distinct, "values")
        .mockResolvedValueOnce(["Alice", "alice"])
        .mockResolvedValueOnce(["Alice"]);
      vi.spyOn(producersApi, "preview").mockResolvedValue({ affected: 2 });
      const rewrite = vi.spyOn(producersApi, "rewrite").mockResolvedValue({ affected: 2 });

      render(<MemoryRouter><SettingsPanel /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

      // Select both
      const boxes = screen.getAllByRole("checkbox");
      await userEvent.click(boxes[0]);
      await userEvent.click(boxes[1]);
      await userEvent.click(screen.getByTestId("producer-merge-btn"));

      // Default merge target = first selected (Alice)
      const mergeInput = await screen.findByTestId("producer-merge-input");
      expect(mergeInput).toHaveValue("Alice");
      await userEvent.click(screen.getByTestId("producer-merge-submit"));

      await userEvent.click(await screen.findByTestId("producer-confirm-commit"));
      await waitFor(() =>
        expect(rewrite).toHaveBeenCalledWith(expect.arrayContaining(["Alice", "alice"]), "Alice"),
      );
    });
  });
});
