import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/api/tracks";
import type { AudioAnalysisResult } from "@/api/analysis";

vi.mock("@/api/analysis");
vi.mock("@/api/tracks");
vi.mock("@/stores/tracks");

import * as analysisModule from "@/api/analysis";
import * as tracksModule from "@/api/tracks";
import { useTrackStore } from "@/stores/tracks";
import { maybeAutoAnalyze } from "@/lib/auto-analyze";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 1,
    title: "Test Beat",
    bpm: null,
    key_signature: null,
    genre: null,
    mood: null,
    tags: null,
    description: null,
    description_draft: null,
    license_type: "exclusive",
    price: null,
    producer: null,
    has_audio: true,
    cover_asset_id: null,
    created_at: "2026-05-17",
    updated_at: "2026-05-17",
    ...overrides,
  };
}

function makeResult(overrides: Partial<AudioAnalysisResult> = {}): AudioAnalysisResult {
  return {
    asset_id: 10,
    sha256: "abc123",
    bpm: 140,
    bpm_confidence: 0.9,
    key: "C major",
    key_confidence: 0.8,
    duration_seconds: 120,
    analyzed_at: "2026-05-17T00:00:00Z",
    ...overrides,
  };
}

describe("maybeAutoAnalyze", () => {
  let mockRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useTrackStore.getState).mockReturnValue({ refresh: mockRefresh } as any);
  });

  it("skips when track already has both bpm and key_signature", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: 120, key_signature: "A minor" })
    );

    await maybeAutoAnalyze(1);

    expect(analysisModule.analysis.analyze).not.toHaveBeenCalled();
    expect(tracksModule.tracks.update).not.toHaveBeenCalled();
  });

  it("patches bpm only when bpm null, key already set, bpm confidence >= 0.7", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: null, key_signature: "A minor" })
    );
    vi.mocked(analysisModule.analysis.analyze).mockResolvedValueOnce(
      makeResult({ bpm: 140.6, bpm_confidence: 0.85, key: "C major", key_confidence: 0.8 })
    );
    vi.mocked(tracksModule.tracks.update).mockResolvedValueOnce(makeTrack({ bpm: 141 }));

    await maybeAutoAnalyze(1);

    expect(tracksModule.tracks.update).toHaveBeenCalledWith(1, { bpm: 141 });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("patches key_signature only when key null, bpm already set, key confidence >= 0.6", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: 120, key_signature: null })
    );
    vi.mocked(analysisModule.analysis.analyze).mockResolvedValueOnce(
      makeResult({ bpm: 120, bpm_confidence: 0.9, key: "D minor", key_confidence: 0.75 })
    );
    vi.mocked(tracksModule.tracks.update).mockResolvedValueOnce(
      makeTrack({ bpm: 120, key_signature: "D minor" })
    );

    await maybeAutoAnalyze(1);

    expect(tracksModule.tracks.update).toHaveBeenCalledWith(1, { key_signature: "D minor" });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("skips bpm patch when confidence is 0.65 (below 0.7 threshold)", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: null, key_signature: null })
    );
    vi.mocked(analysisModule.analysis.analyze).mockResolvedValueOnce(
      makeResult({ bpm: 140, bpm_confidence: 0.65, key: "C major", key_confidence: 0.8 })
    );
    vi.mocked(tracksModule.tracks.update).mockResolvedValueOnce(
      makeTrack({ key_signature: "C major" })
    );

    await maybeAutoAnalyze(1);

    const call = vi.mocked(tracksModule.tracks.update).mock.calls[0];
    expect(call[1]).not.toHaveProperty("bpm");
    expect(call[1]).toHaveProperty("key_signature", "C major");
  });

  it("skips key patch when confidence is 0.55 (below 0.6 threshold)", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: null, key_signature: null })
    );
    vi.mocked(analysisModule.analysis.analyze).mockResolvedValueOnce(
      makeResult({ bpm: 140, bpm_confidence: 0.9, key: "C major", key_confidence: 0.55 })
    );
    vi.mocked(tracksModule.tracks.update).mockResolvedValueOnce(makeTrack({ bpm: 140 }));

    await maybeAutoAnalyze(1);

    const call = vi.mocked(tracksModule.tracks.update).mock.calls[0];
    expect(call[1]).toHaveProperty("bpm", 140);
    expect(call[1]).not.toHaveProperty("key_signature");
  });

  it("calls tracks.update once with combined patch when both fields can be filled", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: null, key_signature: null })
    );
    vi.mocked(analysisModule.analysis.analyze).mockResolvedValueOnce(
      makeResult({ bpm: 90.4, bpm_confidence: 0.95, key: "F# minor", key_confidence: 0.7 })
    );
    vi.mocked(tracksModule.tracks.update).mockResolvedValueOnce(
      makeTrack({ bpm: 90, key_signature: "F# minor" })
    );

    await maybeAutoAnalyze(1);

    expect(tracksModule.tracks.update).toHaveBeenCalledTimes(1);
    expect(tracksModule.tracks.update).toHaveBeenCalledWith(1, {
      bpm: 90,
      key_signature: "F# minor",
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("logs warn and does not throw when analysis.analyze throws", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: null, key_signature: null })
    );
    vi.mocked(analysisModule.analysis.analyze).mockRejectedValueOnce(new Error("504 timeout"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(maybeAutoAnalyze(1)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[auto-analyze] failed"),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it("logs warn and does not throw when tracks.update throws", async () => {
    vi.mocked(tracksModule.tracks.get).mockResolvedValueOnce(
      makeTrack({ bpm: null, key_signature: null })
    );
    vi.mocked(analysisModule.analysis.analyze).mockResolvedValueOnce(
      makeResult({ bpm: 100, bpm_confidence: 0.9, key: "G major", key_confidence: 0.75 })
    );
    vi.mocked(tracksModule.tracks.update).mockRejectedValueOnce(new Error("DB error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(maybeAutoAnalyze(1)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[auto-analyze] failed"),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });
});
