import React, { useMemo } from "react";

import { useTrackStore } from "@/stores/tracks";
import { CoverImage } from "@/components/CoverImage";

const WINDOW = 4; // covers shown each side of the focused one
const PERSPECTIVE = 1400;
const Z_CENTER = 220; // how far the focused cover is pushed toward the viewer
// Under `perspective`, translateZ(Z_CENTER) visually magnifies the focused
// cover by this factor. The stage must reserve room for the magnified extent or
// the cover overflows downward onto the title below it (worst at wide panels /
// the first focused track) — the bug this constant fixes.
const CENTER_MAGNIFY = PERSPECTIVE / (PERSPECTIVE - Z_CENTER);

interface CoverflowProps {
  panelWidth: number;
  centerDraggable?: boolean;
  onCenterDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  /** "r, g, b" channels for the focused cover's glow; defaults to neutral white. */
  glowColor?: string | null;
}

export function Coverflow({
  panelWidth,
  centerDraggable = false,
  onCenterDragStart,
  glowColor,
}: CoverflowProps): React.JSX.Element {
  const glow = glowColor ?? "255, 255, 255";
  const list = useTrackStore((s) => s.list);
  const current = useTrackStore((s) => s.current);
  const select = useTrackStore((s) => s.select);
  const selectOne = useTrackStore((s) => s.selectOne);

  // Focusing a cover both sets `current` AND collapses the multi-select set to
  // that one track — otherwise the previously selected row (still in
  // selectedIds) and the newly focused row (current) both highlight, showing
  // two selected rows at once.
  const focus = (id: number): void => {
    selectOne(id, "replace");
    select(id);
  };

  const index = useMemo(
    () => (current ? list.findIndex((t) => t.id === current.id) : -1),
    [list, current],
  );

  const size = Math.max(120, Math.min(232, Math.round(panelWidth * 0.56)));
  const step = Math.round(size * 0.64);
  // Fit the magnified center cover plus a small gap before the title (its
  // glow/shadow needs to clear the title beneath it). Kept tight to save the
  // detail panel's vertical budget so a medium window fits without scrolling.
  const stageHeight = Math.round(size * CENTER_MAGNIFY) + 24;
  // Snapshot at render time — Electron users effectively never toggle
  // prefers-reduced-motion mid-session, so no MediaQueryList subscription needed.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function focusBy(delta: number): void {
    if (index < 0) return;
    const next = Math.max(0, Math.min(list.length - 1, index + delta));
    const t = list[next];
    if (t && t.id !== current?.id) focus(t.id);
  }

  return (
    <div
      data-testid="coverflow-stage"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          focusBy(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          focusBy(-1);
        }
      }}
      // `shrink-0` is load-bearing: the detail panel is a flex column, so without
      // it this fixed-height stage (whose covers are absolutely positioned, i.e.
      // ~0 min-content height) gets compressed when the track has taller content
      // below (e.g. a 2-line Genre/Mood block). The magnified center cover then
      // overflows the squeezed stage and paints over the title. Verified: removing
      // shrink-0 reproduces a ~100px title overlap.
      className="relative w-full shrink-0 outline-none"
      style={{ height: stageHeight, perspective: PERSPECTIVE }}
    >
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {list.map((t, i) => {
          const off = i - index;
          const abs = Math.abs(off);
          if (index < 0 || abs > WINDOW) return null;
          const isCenter = off === 0;
          const scale = isCenter ? 1 : Math.max(0.55, 1 - abs * 0.16);
          const rotY = isCenter ? 0 : off < 0 ? 28 : -28;
          const z = isCenter ? Z_CENTER : 120 - abs * 40;
          const transform = reduced
            ? `translate(-50%,-50%)`
            : `translate(-50%,-50%) translateX(${off * step}px) translateZ(${z}px) rotateY(${rotY}deg) scale(${scale})`;
          return (
            <div
              key={t.id}
              data-testid={`coverflow-cover-${t.id}`}
              data-active={isCenter ? "true" : undefined}
              role="img"
              tabIndex={-1}
              aria-label={t.title}
              draggable={isCenter && centerDraggable}
              onDragStart={isCenter ? onCenterDragStart : undefined}
              onClick={() => !isCenter && focus(t.id)}
              className="absolute left-1/2 top-1/2 overflow-hidden rounded-2xl shadow-[0_30px_60px_-24px_rgba(0,0,0,.9)] cursor-pointer motion-reduce:transition-opacity"
              style={{
                width: size,
                height: size,
                transform,
                opacity: reduced ? (isCenter ? 1 : 0) : 1 - abs * 0.16,
                zIndex: 100 - abs,
                filter: isCenter ? "none" : `brightness(${1 - abs * 0.16}) saturate(.85)`,
                transition: reduced
                  ? "opacity .35s var(--ease)"
                  : "transform var(--dur-cover) var(--ease), opacity .45s var(--ease), filter .45s var(--ease)",
                boxShadow: isCenter
                  ? `0 30px 60px -24px rgba(0,0,0,.9), 0 0 0 1.5px rgba(${glow}, .5), 0 0 22px -6px rgba(${glow}, .55)`
                  : undefined,
              }}
            >
              <CoverImage assetId={t.cover_asset_id} size={size} responsive rounded={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
