import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTracksFromFiles } from "../create-track-from-file";

// --- module mocks ---

vi.mock("@/api/tracks", () => ({
  tracks: {
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/stores/assets", () => ({
  useAssetStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/tracks", () => ({
  useTrackStore: {
    getState: vi.fn(),
  },
}));

import { tracks } from "@/api/tracks";
import { useAssetStore } from "@/stores/assets";
import { useTrackStore } from "@/stores/tracks";

function makeFile(name: string): File {
  return new File([""], name, { type: "audio/wav" });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: attach succeeds
  vi.mocked(useAssetStore.getState).mockReturnValue({
    attach: vi.fn().mockResolvedValue({ id: 99 }),
  } as any);

  // Default: refresh + refreshTotal are no-ops
  vi.mocked(useTrackStore.getState).mockReturnValue({
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshTotal: vi.fn().mockResolvedValue(undefined),
  } as any);

  // Default: create returns a track
  vi.mocked(tracks.create).mockResolvedValue({ id: 1, title: "test" } as any);

  // window.beatos.getPathForFile
  Object.defineProperty(window, "beatos", {
    value: { getPathForFile: vi.fn().mockReturnValue("/fake/path/file.wav") },
    writable: true,
    configurable: true,
  });
});

describe("createTracksFromFiles", () => {
  it("creates 2 tracks for .wav + .mp3 and skips .pdf", async () => {
    vi.mocked(tracks.create)
      .mockResolvedValueOnce({ id: 1, title: "beat1" } as any)
      .mockResolvedValueOnce({ id: 2, title: "beat2" } as any);

    const files = [
      makeFile("beat1.wav"),
      makeFile("beat2.mp3"),
      makeFile("document.pdf"),
    ];

    const result = await createTracksFromFiles(files);

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(tracks.create).toHaveBeenCalledTimes(2);
    expect(tracks.create).toHaveBeenCalledWith("beat1");
    expect(tracks.create).toHaveBeenCalledWith("beat2");
  });

  it("rolls back via tracks.remove when attach fails", async () => {
    vi.mocked(tracks.create).mockResolvedValue({ id: 42, title: "bad" } as any);
    vi.mocked(tracks.remove).mockResolvedValue(undefined);
    vi.mocked(useAssetStore.getState).mockReturnValue({
      attach: vi.fn().mockRejectedValue(new Error("attach error")),
    } as any);

    const result = await createTracksFromFiles([makeFile("bad.wav")]);

    expect(result.created).toBe(0);
    expect(result.errors[0]).toContain("attach failed");
    expect(tracks.remove).toHaveBeenCalledWith(42);
  });

  it("records error and skips track when getPathForFile throws", async () => {
    (window.beatos.getPathForFile as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("no path");
    });

    const result = await createTracksFromFiles([makeFile("beat.wav")]);

    expect(result.created).toBe(0);
    expect(result.errors[0]).toContain("cannot read path");
    expect(tracks.create).not.toHaveBeenCalled();
  });

  it("records error when getPathForFile returns empty string", async () => {
    (window.beatos.getPathForFile as ReturnType<typeof vi.fn>).mockReturnValue("");

    const result = await createTracksFromFiles([makeFile("beat.wav")]);

    expect(result.created).toBe(0);
    expect(result.errors[0]).toContain("empty path from webUtils");
    expect(tracks.create).not.toHaveBeenCalled();
  });
});
