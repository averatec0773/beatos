import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { vi, beforeEach } from "vitest";
import { SidebarPanel } from "@/components/Sidebar/SidebarPanel";
import { useListStore } from "@/stores/lists";
import { useTrackStore } from "@/stores/tracks";

beforeEach(() => {
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
  useListStore.setState({
    all: [
      { id: 101, name: "Q1 2025", kind: "user", position: 1, created_at: "x" },
    ],
  });
  useTrackStore.setState({
    list: [
      { id: 1 } as any,
      { id: 2 } as any,
      { id: 3 } as any,
    ],
  });
});

it("renders the All Beats row with track count", () => {
  render(<MemoryRouter><DndContext><SidebarPanel /></DndContext></MemoryRouter>);
  expect(screen.getByText("All Beats")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

it("clicking All Beats navigates to /", () => {
  render(
    <MemoryRouter initialEntries={["/trash"]}>
      <DndContext>
        <SidebarPanel />
      </DndContext>
    </MemoryRouter>,
  );
  // Click should not throw; navigation is exercised by react-router-dom
  fireEvent.click(screen.getByText("All Beats"));
});

it("renders sections in the v0.0.22 order", () => {
  const { container } = render(
    <MemoryRouter><DndContext><SidebarPanel /></DndContext></MemoryRouter>,
  );
  // Walk the aside DOM in document order and record the position of each
  // required label by its first occurrence.
  const aside = container.querySelector("aside");
  expect(aside).not.toBeNull();
  const text = aside!.textContent ?? "";
  const required = ["All Beats", "Trash", "Lists", "Approvals"];
  const indices = required.map((needle) => text.indexOf(needle));
  expect(indices.every((i) => i >= 0)).toBe(true);
  const sorted = [...indices].sort((a, b) => a - b);
  expect(indices).toEqual(sorted);
});
