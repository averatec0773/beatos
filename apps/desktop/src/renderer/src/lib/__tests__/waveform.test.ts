import { describe, expect, it } from "vitest";

import { computePeaks, levelToBlock, WAVE_BLOCKS } from "@/lib/waveform";

describe("computePeaks", () => {
  it("returns n bins", () => {
    const ch = new Float32Array(1000).fill(0.5);
    expect(computePeaks(ch, 72)).toHaveLength(72);
  });

  it("normalizes the loudest bin to 1", () => {
    // Ramp 0→1 across the channel — the last bin holds the peak.
    const ch = new Float32Array(1000);
    for (let i = 0; i < ch.length; i++) ch[i] = i / ch.length;
    const peaks = computePeaks(ch, 10);
    expect(Math.max(...peaks)).toBeCloseTo(1, 5);
    expect(peaks[peaks.length - 1]).toBeCloseTo(1, 5);
  });

  it("treats negative samples by magnitude", () => {
    const ch = new Float32Array([-0.9, 0.1, -0.2, 0.3]);
    const peaks = computePeaks(ch, 2);
    // First half peak |−0.9| dominates → normalizes to 1.
    expect(peaks[0]).toBeCloseTo(1, 5);
    expect(peaks[1]).toBeLessThan(1);
  });

  it("returns all zeros for silence", () => {
    const peaks = computePeaks(new Float32Array(500), 8);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("returns all zeros for an empty channel", () => {
    expect(computePeaks(new Float32Array(0), 8)).toEqual(new Array(8).fill(0));
  });

  it("returns [] for n<=0", () => {
    expect(computePeaks(new Float32Array(10), 0)).toEqual([]);
  });
});

describe("levelToBlock", () => {
  it("maps 0 to the lowest block and 1 to the full block", () => {
    expect(levelToBlock(0)).toBe(WAVE_BLOCKS[0]);
    expect(levelToBlock(1)).toBe(WAVE_BLOCKS[WAVE_BLOCKS.length - 1]);
  });

  it("clamps out-of-range input", () => {
    expect(levelToBlock(-5)).toBe(WAVE_BLOCKS[0]);
    expect(levelToBlock(99)).toBe(WAVE_BLOCKS[WAVE_BLOCKS.length - 1]);
  });

  it("maps the midpoint into the middle of the ramp", () => {
    const mid = levelToBlock(0.5);
    expect(WAVE_BLOCKS).toContain(mid);
    expect(WAVE_BLOCKS.indexOf(mid as (typeof WAVE_BLOCKS)[number])).toBeGreaterThan(0);
  });
});
