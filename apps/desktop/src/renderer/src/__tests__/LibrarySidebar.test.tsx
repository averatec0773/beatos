import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { LibrarySidebar } from "@/components/LibrarySidebar";
import { useLibraryStore } from "@/stores/library";
import { sampleLibrary } from "@/test/fixtures";

describe("LibrarySidebar", () => {
  it("renders Library header, All Beats, and Settings link", () => {
    useLibraryStore.setState({ active: sampleLibrary });
    render(
      <MemoryRouter>
        <LibrarySidebar />
      </MemoryRouter>
    );
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("All Beats")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("New library")).toBeInTheDocument();
  });

  it("shows the active library name at the bottom", () => {
    useLibraryStore.setState({ active: sampleLibrary });
    render(
      <MemoryRouter>
        <LibrarySidebar />
      </MemoryRouter>
    );
    expect(screen.getByText(sampleLibrary.name)).toBeInTheDocument();
  });
});
