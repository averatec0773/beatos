import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/EmptyState";

describe("EmptyState variants", () => {
  it("no-tracks shows Add Track CTA", () => {
    const onAddTrack = vi.fn();
    render(<EmptyState variant="no-tracks" onAddTrack={onAddTrack} />);
    expect(screen.getByText(/start your beat catalog/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add track/i })).toBeInTheDocument();
  });

  it("empty-list shows drag hint with list name", () => {
    render(<EmptyState variant="empty-list" listName="Trap demos" />);
    expect(screen.getByText(/Trap demos/i)).toBeInTheDocument();
    expect(screen.getByText(/drag tracks from all beats/i)).toBeInTheDocument();
  });

  it("no-search-results shows query + clear link", () => {
    const onClear = vi.fn();
    render(<EmptyState variant="no-search-results" query="hyperpop" onClear={onClear} />);
    expect(screen.getByText(/no tracks match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });
});
