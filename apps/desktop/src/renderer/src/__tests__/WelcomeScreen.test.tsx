import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { WelcomeScreen } from "@/routes/WelcomeScreen";
import { useSourceStore } from "@/stores/sources";

describe("WelcomeScreen", () => {
  beforeEach(() => {
    useSourceStore.setState({ all: [], activeFilter: null });
  });

  it("shows 'Add your first Source' framing", () => {
    render(<MemoryRouter><WelcomeScreen /></MemoryRouter>);
    expect(screen.getByText(/add your first source/i)).toBeInTheDocument();
  });

  it("triggers folder picker and addSource on Choose folder", async () => {
    const add = vi.fn().mockResolvedValue({ id: 1 });
    useSourceStore.setState({ add: add as any });
    (window.beatos.openFolderDialog as any) = vi.fn().mockResolvedValue("/tmp/MyBeats");

    render(<MemoryRouter><WelcomeScreen /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: /Choose folder/i }));

    expect(add).toHaveBeenCalledWith({ root_path: "/tmp/MyBeats" });
  });
});
