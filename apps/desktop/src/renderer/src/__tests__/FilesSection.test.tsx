import { render, screen } from "@testing-library/react";
import { FilesSection } from "@/components/FilesSection";
import { useAssetStore } from "@/stores/assets";

beforeEach(() => {
  useAssetStore.setState({ byTrack: { 1: [] } });
});

it("renders 6 asset slots: cover, stems, 4 audio variants", () => {
  render(<FilesSection trackId={1} />);
  expect(screen.getByText("Cover")).toBeInTheDocument();
  expect(screen.getByText("Stems")).toBeInTheDocument();
  expect(screen.getByText("Tagged MP3")).toBeInTheDocument();
  expect(screen.getByText("Untagged MP3")).toBeInTheDocument();
  expect(screen.getByText("Tagged WAV")).toBeInTheDocument();
  expect(screen.getByText("Untagged WAV")).toBeInTheDocument();
});
