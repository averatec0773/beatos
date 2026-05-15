import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { LibrarySwitcher } from "@/components/LibrarySwitcher";
import { useLibraryStore } from "@/stores/library";
import { sampleLibrary } from "@/test/fixtures";

describe("LibrarySwitcher", () => {
  it("shows the active library name", () => {
    useLibraryStore.setState({ active: sampleLibrary, list: [sampleLibrary] });
    render(
      <MemoryRouter>
        <LibrarySwitcher />
      </MemoryRouter>
    );
    expect(screen.getByText(sampleLibrary.name)).toBeInTheDocument();
  });

  it("offers a New library item that triggers folder dialog + init", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    useLibraryStore.setState({ active: sampleLibrary, list: [sampleLibrary], init });
    (window.beatos.openFolderDialog as any) = vi.fn().mockResolvedValue("/tmp/new-lib");

    render(
      <MemoryRouter>
        <LibrarySwitcher />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByText(sampleLibrary.name));
    await userEvent.click(screen.getByText(/New library/i));
    expect(init).toHaveBeenCalledWith("/tmp/new-lib");
  });
});
