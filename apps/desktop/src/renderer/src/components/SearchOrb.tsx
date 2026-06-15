import React, { useEffect, useRef, useState, type CSSProperties } from "react";

import { hasWebgl, mountScene, type UnicornScene } from "@/lib/unicorn-runtime";
import sceneData from "@/assets/backdrops/creating-search.json";

/**
 * The glowing plasma orb that replaces the search icon in {@link SearchInput} —
 * the "Creating (Remix)" Unicorn Studio scene (text + its vignette removed)
 * mounted as a small WebGL canvas. The scene is authored as an orb sitting in a
 * dark capsule; we render it larger than the pill and shift it left so the orb
 * lands as the leading icon, then a *radial* mask centred on the orb crops away
 * the capsule (so it doesn't draw a second border inside the app's pill) and
 * leaves just the glowing ball. The real `<input>` floats above it (CLAUDE.md
 * rule 17 for the offline/CSP plumbing).
 *
 * Guards: `prefers-reduced-motion` and GPU-less / jsdom hosts fall back to a
 * static gradient orb (no WebGL, no animation). `focused` brightens it.
 */

// ── Tuning / evaluating this orb (read before changing the numbers below) ─────
// This is a WebGL scene, NOT a plain centred element, so its position must be
// judged at the user's real pixel density. Lessons learned the hard way:
//   • ALWAYS evaluate at 2× DPR (retina). A 1× CSS screenshot hides sub-pixel
//     offsets — a 4px vertical error is invisible at 1× and caused many wrong
//     "fixes". Drive it with Playwright `newContext({ deviceScaleFactor: 2 })`.
//   • MEASURE, don't eyeball: screenshot the pill, find the orb's bright-pixel
//     bounding box, compare its centre to the target. Eyeballing overshot
//     repeatedly in both directions.
//   • The orb sits at ~(22%, 46%) of the scene canvas (not its centre), so its
//     on-screen centre ≠ the element centre — hence the translate + the measured
//     ORB_CX/ORB_CY below rather than naive centring.
//
// The scene (just the orb — capsule/vignette/text/gradient all stripped, so it
// renders on transparency, no mask) is drawn into a 228×105 element (5% smaller
// than the 240×111 export framing → orb Ø≈34px). Measured at 2×, the orb's bbox
// centre lands on the pill's left rounded-cap centre (26, 26) within ±0.3px —
// i.e. concentric with the cap, equal top/left/bottom margins. Re-tune only by
// re-measuring at 2×.
const ORB_W = 228;
const ORB_H = 105;
const ORB_CX = 50;
const ORB_CY = 52;
const TARGET_X = 21;
const TARGET_Y = 25;

const ORB_MOUNT: CSSProperties = {
  position: "absolute",
  width: ORB_W,
  height: ORB_H,
  left: 0,
  top: TARGET_Y - ORB_CY,
  transform: `translateX(${TARGET_X - ORB_CX}px)`,
};

// Static fallback — a calm magenta gradient orb, no animation (reduced motion)
// and no WebGL (jsdom / GPU-less). Sized + placed to match the live orb.
const STATIC_ORB: CSSProperties = {
  position: "absolute",
  left: TARGET_X - 17,
  top: "50%",
  width: 34,
  height: 34,
  marginTop: -17,
  borderRadius: "50%",
  background:
    "radial-gradient(circle at 50% 42%, #ffffff 0%, #ffd6f5 12%, #ff5ad5 34%, #b44bff 60%, #6a1fe0 82%, #3a0f8f 100%)",
  boxShadow: "0 0 7px 1px rgba(214,82,255,.5), 0 0 15px 4px rgba(124,43,255,.32)",
};

export function SearchOrb({ focused = false }: { focused?: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  // Decide once on mount: live WebGL scene, or the static fallback.
  const [live] = useState(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    return !reduced && hasWebgl();
  });

  useEffect(() => {
    if (!live) return;
    const el = ref.current;
    if (!el) return;
    let scene: UnicornScene | null = null;
    let cancelled = false;
    // dpi 4: the orb is a small fraction of the canvas, so oversample it
    // generously to keep the plasma crisp (cost is trivial at this size).
    void mountScene(el, sceneData, { dpi: 4, scale: 1, fps: 30 }, () => cancelled)
      .then((s) => {
        if (!s) return;
        if (cancelled) s.destroy();
        else scene = s;
      })
      .catch(() => {
        /* runtime/scene failed — the plain pill simply shows no orb */
      });
    return () => {
      cancelled = true;
      scene?.destroy();
      scene = null;
    };
  }, [live]);

  // Brighten on focus (CSS filter — the scene has no intensity uniform).
  const focusFilter = focused ? "brightness(1.22) saturate(1.08)" : undefined;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {live ? (
        <div ref={ref} style={{ ...ORB_MOUNT, filter: focusFilter, transition: "filter .2s ease" }} />
      ) : (
        <div style={{ ...STATIC_ORB, filter: focusFilter, transition: "filter .2s ease" }} />
      )}
    </div>
  );
}
