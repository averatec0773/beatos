/**
 * Pure helpers for the ASCII seek waveform. Kept free of DOM/canvas/Tone so
 * they're unit-testable under jsdom (canvas drawing itself is verified in the
 * real app via Playwright, per CLAUDE.md rule 12).
 */

/** The 8-step block ramp used to render an amplitude as a single glyph. */
export const WAVE_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Downsample a mono PCM channel to `n` normalized peak bins (0–1).
 *
 * Each bin takes the max absolute sample in its slice (peak, not RMS — peaks
 * read as a recognizable waveform silhouette), then the whole set is scaled so
 * the loudest bin maps to 1. Silence (or an empty channel) yields all-zeros.
 */
export function computePeaks(channel: Float32Array, n: number): number[] {
  const bins = new Array<number>(n).fill(0);
  if (n <= 0) return [];
  if (channel.length === 0) return bins;
  const per = channel.length / n;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * per);
    const end = Math.min(channel.length, Math.floor((i + 1) * per));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(channel[j]);
      if (a > peak) peak = a;
    }
    bins[i] = peak;
    if (peak > max) max = peak;
  }
  if (max > 0) {
    for (let i = 0; i < n; i++) bins[i] /= max;
  }
  return bins;
}

/** Map a 0–1 level to one of the 8 block glyphs (clamped). */
export function levelToBlock(level: number): string {
  const clamped = level <= 0 ? 0 : level >= 1 ? 1 : level;
  const idx = Math.min(WAVE_BLOCKS.length - 1, Math.round(clamped * (WAVE_BLOCKS.length - 1)));
  return WAVE_BLOCKS[idx];
}
