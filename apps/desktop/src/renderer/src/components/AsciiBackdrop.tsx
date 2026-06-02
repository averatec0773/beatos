import React, { useEffect, useRef } from "react";

import { useAppearanceStore } from "@/stores/appearance";

/**
 * Ambient monochrome "glyph-rain" backdrop painted on a <canvas> that sits
 * behind the floating column cards (z-0). The translucent `.beatos-card`
 * surfaces let it read as a soft data-terrain through their blur; in the
 * gutters and behind the (transparent) top bar it shows as faint characters.
 *
 * Intensity (peak alpha) and speed are user preferences (Settings → Appearance,
 * `useAppearanceStore`); the whole backdrop can be switched off there too.
 * Two perf/accessibility guards mirror the rest of the app:
 *   - `prefers-reduced-motion` → paint ONE static frame, no rAF loop
 *     (same fallback convention as `Coverflow`).
 *   - pause the rAF loop while the document is hidden or the window is blurred,
 *     resume on focus/visible — an idle library window shouldn't burn a core.
 */

// Density ramp, sparse→dense. Leading two chars are blank-ish so most cells
// stay empty and the field reads as scattered glyphs, not a solid sheet.
const RAMP = " .:-=+*#%@";
const CELL_W = 9;
const CELL_H = 14;
const FRAME_MS = 45; // ~22fps — a calm "terminal" cadence, easy on the CPU
const SPEED_BASELINE = 7; // store speed that maps to the original 1× cadence

interface Drop {
  y: number;
  len: number;
  sp: number;
}

export function AsciiBackdrop(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const enabled = useAppearanceStore((s) => s.backdropEnabled);
  const intensity = useAppearanceStore((s) => s.backdropIntensity);
  const speed = useAppearanceStore((s) => s.backdropSpeed);
  // Live refs so intensity/speed changes apply without tearing down the loop.
  const intensityRef = useRef(intensity);
  const speedRef = useRef(speed);
  useEffect(() => {
    intensityRef.current = intensity;
    speedRef.current = speed;
  }, [intensity, speed]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const context = el.getContext("2d");
    if (!context) return;
    if (!enabled) {
      context.clearRect(0, 0, el.width, el.height);
      return;
    }
    // Rebind to non-null locals so the narrowing survives inside the nested
    // closures below (TS widens captured union-typed consts otherwise).
    const cv: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    let cols = 0;
    let rows = 0;
    let drops: Drop[] = [];
    let raf = 0;
    let last = 0;
    let running = false;

    function sizeToParent(): void {
      const parent = cv.parentElement;
      const w = parent?.clientWidth ?? window.innerWidth;
      const h = parent?.clientHeight ?? window.innerHeight;
      cv.width = Math.max(1, Math.floor(w * dpr));
      cv.height = Math.max(1, Math.floor(h * dpr));
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "top";
      ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
      cols = Math.ceil(w / CELL_W);
      rows = Math.ceil(h / CELL_H);
      drops = Array.from({ length: cols }, () => ({
        y: Math.random() * rows,
        len: 6 + Math.random() * 18,
        sp: 0.3 + Math.random() * 0.9,
      }));
    }

    function paint(advance: boolean): void {
      const w = cv.width / dpr;
      const h = cv.height / dpr;
      ctx.clearRect(0, 0, w, h);
      const maxAlpha = intensityRef.current / 100;
      const speedMul = speedRef.current / SPEED_BASELINE;
      for (let c = 0; c < cols; c++) {
        const d = drops[c];
        for (let i = 0; i < d.len; i++) {
          const yy = Math.floor(d.y) - i;
          if (yy < 0 || yy > rows) continue;
          const fade = 1 - i / d.len;
          const a = Math.min(maxAlpha * fade * (i === 0 ? 2.2 : 1), 0.6);
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          const ch = RAMP[2 + ((Math.floor(d.y) + c + i) % (RAMP.length - 2))];
          ctx.fillText(ch || ".", c * CELL_W, yy * CELL_H);
        }
        if (advance) {
          d.y += d.sp * speedMul;
          if (d.y - d.len > rows) {
            d.y = 0;
            d.len = 6 + Math.random() * 18;
            d.sp = 0.3 + Math.random() * 0.9;
          }
        }
      }
    }

    function tick(ts: number): void {
      raf = requestAnimationFrame(tick);
      if (ts - last < FRAME_MS) return;
      last = ts;
      paint(true);
    }

    function start(): void {
      if (running || reduced) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    }
    function stop(): void {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function onVisibility(): void {
      if (document.hidden) stop();
      else start();
    }

    const ro = new ResizeObserver(() => {
      sizeToParent();
      paint(false); // keep a fresh static frame even while paused
    });
    if (cv.parentElement) ro.observe(cv.parentElement);

    sizeToParent();
    paint(false);
    if (reduced) {
      // Static single frame only — honour reduced motion.
    } else {
      start();
      // Pause ONLY when the window is actually hidden/minimized — NOT on mere
      // focus loss (clicking another app while BeatOS stays visible would
      // freeze the rain and look broken).
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return (
    <canvas
      ref={ref}
      data-ascii-backdrop
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}
