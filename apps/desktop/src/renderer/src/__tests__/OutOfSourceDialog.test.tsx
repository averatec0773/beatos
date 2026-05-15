import { render, screen, fireEvent } from "@testing-library/react";
import { OutOfSourceDialog } from "@/components/OutOfSourceDialog";
import type { Source } from "@/api/sources";

const sources: Source[] = [
  { id: 1, name: "Main", root_path: "/m", position: 0, created_at: "x", status: "online", track_count: 0 },
];

it("renders 3 options when ≥1 Source", () => {
  render(
    <OutOfSourceDialog
      open
      filePath="/Users/me/Desktop/cool.wav"
      availableSources={sources}
      onCancel={() => {}}
      onCopy={() => {}}
      onMove={() => {}}
      onAddAsSource={() => {}}
    />
  );
  expect(screen.getByLabelText(/copy into source/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/move into source/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/add.*as a source/i)).toBeInTheDocument();
});

it("calls onCopy with destination source", () => {
  const onCopy = vi.fn();
  render(
    <OutOfSourceDialog
      open
      filePath="/Users/me/Desktop/cool.wav"
      availableSources={sources}
      onCancel={() => {}}
      onCopy={onCopy}
      onMove={() => {}}
      onAddAsSource={() => {}}
    />
  );
  fireEvent.click(screen.getByText(/continue/i));
  expect(onCopy).toHaveBeenCalledWith({ sourceId: 1, subfolder: "" });
});
