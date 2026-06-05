import React, { useEffect, useRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useTranslation } from "react-i18next";

import { usePlayerStore } from "@/stores/player";
import { audioEngine } from "@/lib/audio-engine";

/**
 * The player's seek control rendered as a fine monochrome waveform.
 *
 * It IS the seek control — a Radix Slider whose visual track is a <canvas>
 * (Radix keeps click/drag → `onValueChange`). While playing it downsamples the
 * live analyser signal (`audioEngine.getWaveform`) so the whole field reacts to
 * the audio; when paused it shows the track's static silhouette
 * (`audioEngine.getPeaks`). Bars up to the playhead are bright, the rest dim.
 *
 * Drawn as thin centre-mirrored bars (not chunky block glyphs) so it reads as a
 * crisp, fine waveform. Respects `prefers-reduced-motion`: no rAF, just a
 * static frame that still re-renders as the position prop advances.
 */

// More, thinner columns than the old block-glyph version.
const BARS = 150;
const BAR_W = 1.5; // px — the rest of each column is gap
const BRIGHT = "rgba(255,255,255,0.92)";
const DIM = "rgba(255,255,255,0.22)";

interface Props {
  min: number;
  max: number;
  step?: number;
  value: number[];
  disabled?: boolean;
  onValueChange: (value: number[]) => void;
  className?: string;
}

export function AsciiSeekWaveform({
  min,
  max,
  step = 0.1,
  value,
  disabled = false,
  onValueChange,
  className,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const breathRef = useRef(0); // smoothed live level — gentle, not per-bar jitter
  const status = usePlayerStore((s) => s.status);
  const progress = max > 0 ? Math.min(1, Math.max(0, value[0] / max)) : 0;
  const progressRef = useRef(progress);
  // Keep the rAF/draw closures' progress current without writing the ref during
  // render (react-hooks/refs). This effect runs before the paused-seek redraw
  // effect below, so the bright/dim split is up to date when it repaints.
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Setup keyed on `status` only (NOT `value`) — re-running per position tick
  // would tear down the rAF/observer every frame.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const context = el.getContext("2d");
    if (!context) return;
    // Non-null locals so narrowing survives inside the nested closures below.
    const cv: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    function size(): void {
      const w = cv.clientWidth || 1;
      const h = cv.clientHeight || 1;
      cv.width = Math.max(1, Math.floor(w * dpr));
      cv.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(): void {
      const w = cv.width / dpr;
      const h = cv.height / dpr;
      ctx.clearRect(0, 0, w, h);
      // Stable per-track silhouette (calm, recognizable). NOT a per-frame live
      // scope — that read as chaotic. Playback is conveyed by the advancing
      // bright fill plus a gentle, smoothed breathing on the played region.
      const peaks = audioEngine.getPeaks(BARS);
      const playing = status === "playing";
      breathRef.current += ((playing ? audioEngine.getLiveLevel() : 0) - breathRef.current) * 0.12;
      const breath = breathRef.current;
      const cw = w / BARS;
      const prog = progressRef.current;
      const mid = h / 2;
      for (let i = 0; i < BARS; i++) {
        let amp = peaks ? peaks[i] : 0.04;
        const played = i / BARS <= prog;
        if (played && playing) amp = Math.min(1, amp * (1 + breath * 0.18));
        const barH = Math.max(1, amp * (h - 1));
        ctx.fillStyle = played ? BRIGHT : DIM;
        // Centre-mirrored thin bar.
        ctx.fillRect(i * cw, mid - barH / 2, BAR_W, barH);
      }
    }

    drawRef.current = draw;
    size();
    draw();

    const ro = new ResizeObserver(() => {
      size();
      draw();
    });
    ro.observe(cv);

    let raf = 0;
    let last = 0;
    const animate = (ts: number): void => {
      raf = requestAnimationFrame(animate);
      if (ts - last < 33) return; // ~30fps
      last = ts;
      draw();
    };
    if (!reduced && status === "playing") raf = requestAnimationFrame(animate);

    return () => {
      drawRef.current = null;
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [status]);

  // Paused-seek redraw: advancing the position prop while NOT playing (drag /
  // click) must move the bright/dim split. While playing the rAF already redraws.
  useEffect(() => {
    if (status !== "playing") drawRef.current?.();
  }, [progress, status]);

  return (
    <SliderPrimitive.Root
      className={`relative flex h-5 w-full touch-none select-none items-center ${className ?? ""}`}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
    >
      <SliderPrimitive.Track className="relative h-5 w-full grow">
        <canvas ref={canvasRef} data-seek-waveform className="absolute inset-0 h-full w-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-4 w-[2px] rounded-sm bg-white/80 shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white disabled:pointer-events-none"
        aria-label={t("player.seek")}
      />
    </SliderPrimitive.Root>
  );
}
