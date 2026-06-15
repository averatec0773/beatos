import React, { useEffect, useRef } from "react";

import { mountScene, type UnicornScene } from "@/lib/unicorn-runtime";
// The scene is bundled as a parsed object; the runtime + Blob-URL plumbing live
// in `lib/unicorn-runtime` (shared with the search-box orb). See CLAUDE.md rule 17.
import sceneData from "@/assets/backdrops/frosty-aurora.json";

/**
 * Ambient "aurora" backdrop — a Unicorn Studio WebGL gradient/noise field
 * (violet `#7001d7`) painted behind the floating column cards (z-0), the GPU
 * sibling of {@link AsciiBackdrop}. The translucent `.beatos-card` surfaces let
 * it read as soft moving light through their blur (CLAUDE.md rule 13).
 *
 * Guards mirror the rest of the app:
 *   - `prefers-reduced-motion` → skip the animated scene entirely (dark base).
 *   - the engine drives its own rAF, which the browser/Electron throttle while
 *     the window is hidden, so an idle window doesn't burn the GPU.
 */
export function UnicornBackdrop(): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reduced) return; // honour reduced-motion — leave the dark app base

    let scene: UnicornScene | null = null;
    let cancelled = false;

    void mountScene(
      el,
      sceneData,
      {
        // Always-on full-window backdrop → render lighter than the export's
        // dpi 1.5 / scale 1 defaults to keep the GPU cost modest. It sits behind
        // blurred cards, so the softer resolution is invisible.
        dpi: 1,
        scale: 1,
        fps: 60,
      },
      () => cancelled,
    )
      .then((s) => {
        if (!s) return;
        if (cancelled) s.destroy();
        else scene = s;
      })
      .catch(() => {
        /* runtime or scene failed to load — silently leave the dark base */
      });

    return () => {
      cancelled = true;
      scene?.destroy();
      scene = null;
    };
  }, []);

  return (
    <div
      ref={ref}
      data-unicorn-backdrop
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}
