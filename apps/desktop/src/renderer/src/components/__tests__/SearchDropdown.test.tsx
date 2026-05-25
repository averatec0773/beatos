import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchDropdown } from "@/components/SearchDropdown";

function renderDropdown(overrides: Partial<React.ComponentProps<typeof SearchDropdown>> = {}) {
  const onPickQuery = vi.fn();
  const onPickChip = vi.fn();
  const onOpenTrack = vi.fn();
  render(
    <SearchDropdown
      recent={["dark trap"]}
      topProducers={[{ value: "young chop", count: 3 }]}
      topGenres={[{ value: "trap", count: 5 }]}
      topKeys={[{ value: "C# min", count: 2 }]}
      recentlyAdded={[{ id: 7, title: "Midnight" }]}
      onPickQuery={onPickQuery}
      onPickChip={onPickChip}
      onOpenTrack={onOpenTrack}
      {...overrides}
    />,
  );
  return { onPickQuery, onPickChip, onOpenTrack };
}

describe("SearchDropdown", () => {
  it("renders the three sections", () => {
    renderDropdown();
    expect(screen.getByText(/Recent searches/i)).toBeInTheDocument();
    expect(screen.getByText(/Top producers/i)).toBeInTheDocument();
    expect(screen.getByText(/Top genres/i)).toBeInTheDocument();
    expect(screen.getByText(/Top keys/i)).toBeInTheDocument();
    expect(screen.getByText(/Recently added/i)).toBeInTheDocument();
  });

  it("calls onPickChip with the right field/value for a genre chip", async () => {
    const user = userEvent.setup();
    const { onPickChip } = renderDropdown();
    await user.click(screen.getByText("trap"));
    expect(onPickChip).toHaveBeenCalledWith("genres", "trap");
  });

  it("calls onPickChip with producers field for a producer chip", async () => {
    const user = userEvent.setup();
    const { onPickChip } = renderDropdown();
    await user.click(screen.getByText("young chop"));
    expect(onPickChip).toHaveBeenCalledWith("producers", "young chop");
  });

  it("calls onPickQuery and onOpenTrack", async () => {
    const user = userEvent.setup();
    const { onPickQuery, onOpenTrack } = renderDropdown();
    await user.click(screen.getByText("dark trap"));
    expect(onPickQuery).toHaveBeenCalledWith("dark trap");
    await user.click(screen.getByText("Midnight"));
    expect(onOpenTrack).toHaveBeenCalledWith(7);
  });

  it("renders nothing when everything is empty", () => {
    const { container } = render(
      <SearchDropdown
        recent={[]}
        topProducers={[]}
        topGenres={[]}
        topKeys={[]}
        recentlyAdded={[]}
        onPickQuery={vi.fn()}
        onPickChip={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
