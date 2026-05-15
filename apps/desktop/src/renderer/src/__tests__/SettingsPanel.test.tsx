import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SettingsPanel } from "@/routes/SettingsPanel";
import { useSourceStore } from "@/stores/sources";

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
});
