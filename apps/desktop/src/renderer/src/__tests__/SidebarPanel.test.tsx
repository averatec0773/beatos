import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { SidebarPanel } from "@/components/Sidebar/SidebarPanel";
import { useSourceStore } from "@/stores/sources";
import { useListStore } from "@/stores/lists";

beforeEach(() => {
  useSourceStore.setState({
    all: [
      { id: 1, name: "Main", root_path: "/m", position: 0, created_at: "x", status: "online", track_count: 10 },
      { id: 2, name: "Archive", root_path: "/a", position: 1, created_at: "x", status: "offline", track_count: 0 },
    ],
    activeFilter: null,
  });
  useListStore.setState({
    all: [
      { id: 100, name: "All Beats", kind: "system", position: 0, created_at: "x" },
      { id: 101, name: "Q1 2025", kind: "user", position: 1, created_at: "x" },
    ],
  });
});

it("renders SOURCES and LISTS sections", () => {
  render(<MemoryRouter><DndContext><SidebarPanel /></DndContext></MemoryRouter>);
  expect(screen.getByText(/sources/i)).toBeInTheDocument();
  expect(screen.getByText(/lists/i)).toBeInTheDocument();
  expect(screen.getByText("Main")).toBeInTheDocument();
  expect(screen.getByText("Archive")).toBeInTheDocument();
  expect(screen.getByText("All Beats")).toBeInTheDocument();
});

it("clicking a Source sets activeFilter", () => {
  render(<MemoryRouter><DndContext><SidebarPanel /></DndContext></MemoryRouter>);
  fireEvent.click(screen.getByText("Main"));
  expect(useSourceStore.getState().activeFilter).toBe(1);
});

it("clicking All Beats clears activeFilter", () => {
  useSourceStore.setState({ activeFilter: 1 });
  render(<MemoryRouter><DndContext><SidebarPanel /></DndContext></MemoryRouter>);
  fireEvent.click(screen.getByText("All Beats"));
  expect(useSourceStore.getState().activeFilter).toBeNull();
});
