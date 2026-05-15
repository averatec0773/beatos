import { render, screen, fireEvent } from "@testing-library/react";
import { SourceRow } from "@/components/SourceRow";
import type { Source } from "@/api/sources";

const onlineSource: Source = {
  id: 1, name: "Main", root_path: "/p", position: 0, created_at: "x",
  status: "online", track_count: 42,
};

it("shows track count for online Source", () => {
  render(<SourceRow source={onlineSource} active={false} onClick={() => {}} />);
  expect(screen.getByText("42")).toBeInTheDocument();
});

it("hides track count + shows offline indicator for offline Source", () => {
  render(<SourceRow source={{ ...onlineSource, status: "offline" }} active={false} onClick={() => {}} />);
  expect(screen.queryByText("42")).not.toBeInTheDocument();
  expect(screen.getByText(/offline/i)).toBeInTheDocument();
});

it("fires onClick when clicked", () => {
  const fn = vi.fn();
  render(<SourceRow source={onlineSource} active={false} onClick={fn} />);
  fireEvent.click(screen.getByRole("button"));
  expect(fn).toHaveBeenCalled();
});

it("marks active with × prefix", () => {
  render(<SourceRow source={onlineSource} active={true} onClick={() => {}} />);
  expect(screen.getByText(/×/)).toBeInTheDocument();
});
