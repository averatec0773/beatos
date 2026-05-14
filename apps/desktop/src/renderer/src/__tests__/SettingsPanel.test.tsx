import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SettingsPanel } from "@/routes/SettingsPanel";
import { useLibraryStore } from "@/stores/library";
import { sampleLibrary } from "@/test/fixtures";

describe("SettingsPanel", () => {
  it("lists libraries and marks the active one", () => {
    useLibraryStore.setState({ active: sampleLibrary, list: [sampleLibrary] });
    render(
      <MemoryRouter>
        <SettingsPanel />
      </MemoryRouter>
    );
    expect(screen.getByText("TestLib")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("calls switchTo with root_path when Switch is clicked on inactive lib", async () => {
    const otherLib = {
      ...sampleLibrary,
      id: 0,
      name: "Other",
      root_path: "/tmp/Other",
      is_active: false,
    };
    const switchTo = vi.fn().mockResolvedValue(undefined);
    useLibraryStore.setState({
      active: sampleLibrary,
      list: [sampleLibrary, otherLib],
      switchTo,
    });

    render(
      <MemoryRouter>
        <SettingsPanel />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /switch/i }));
    expect(switchTo).toHaveBeenCalledWith("/tmp/Other");
  });
});
