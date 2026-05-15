import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilesSection } from "@/components/FilesSection";
import { useAssetStore } from "@/stores/assets";

describe("FilesSection", () => {
  it("renders three slots in empty state", () => {
    useAssetStore.setState({ byTrack: { 1: [] } });
    render(<FilesSection trackId={1} />);
    expect(screen.getByText(/Attach Audio/i)).toBeInTheDocument();
    expect(screen.getByText(/Attach Stems/i)).toBeInTheDocument();
    expect(screen.getByText(/Attach Cover/i)).toBeInTheDocument();
  });

  it("calls attach when a slot is clicked", async () => {
    const attach = vi.fn().mockResolvedValue({
      id: 99,
      track_id: 1,
      role: "audio",
      mode: "linked",
      abs_path: "/tmp/x.wav",
      rel_path: null,
      sha256: "x",
      size_bytes: 1024,
      mime_type: null,
      missing: false,
      created_at: "2026-05-14T00:00:00Z",
    });
    useAssetStore.setState({ byTrack: { 1: [] }, attach });
    (window.beatos.openFileDialog as any) = vi.fn().mockResolvedValue("/tmp/x.wav");

    render(<FilesSection trackId={1} />);
    await userEvent.click(screen.getByText(/Attach Audio/i));

    expect(attach).toHaveBeenCalledWith(1, "audio", "/tmp/x.wav");
  });
});
