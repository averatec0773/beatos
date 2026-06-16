import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchDropdown } from "@/components/SearchDropdown";

function renderDropdown(overrides: Partial<React.ComponentProps<typeof SearchDropdown>> = {}) {
  const onPickQuery = vi.fn();
  const onPickChip = vi.fn();
  const onOpenTrack = vi.fn();
  const onRemoveRecent = vi.fn();
  const onClearRecent = vi.fn();
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
      onRemoveRecent={onRemoveRecent}
      onClearRecent={onClearRecent}
      {...overrides}
    />,
  );
  return { onPickQuery, onPickChip, onOpenTrack, onRemoveRecent, onClearRecent };
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

  it("removes a single recent search and clears all", async () => {
    const user = userEvent.setup();
    const { onRemoveRecent, onClearRecent } = renderDropdown();
    await user.click(screen.getByRole("button", { name: /Remove/i }));
    expect(onRemoveRecent).toHaveBeenCalledWith("dark trap");
    await user.click(screen.getByText("Clear"));
    expect(onClearRecent).toHaveBeenCalled();
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
        onRemoveRecent={vi.fn()}
        onClearRecent={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
