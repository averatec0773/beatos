import React, { useMemo } from "react";

import { useTrackStore } from "@/stores/tracks";
import { CoverImage } from "@/components/CoverImage";

const WINDOW = 4; // covers shown each side of the focused one

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

  const index = useMemo(
    () => (current ? list.findIndex((t) => t.id === current.id) : -1),
    [list, current],
  );

  const size = Math.max(120, Math.min(232, Math.round(panelWidth * 0.56)));
  const step = Math.round(size * 0.64);
  // Snapshot at render time — Electron users effectively never toggle
  // prefers-reduced-motion mid-session, so no MediaQueryList subscription needed.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function focusBy(delta: number): void {
    if (index < 0) return;
    const next = Math.max(0, Math.min(list.length - 1, index + delta));
    const t = list[next];
    if (t && t.id !== current?.id) select(t.id);
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
      className="relative w-full outline-none"
      style={{ height: size + 32, perspective: 1400 }}
    >
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {list.map((t, i) => {
          const off = i - index;
          const abs = Math.abs(off);
          if (index < 0 || abs > WINDOW) return null;
          const isCenter = off === 0;
          const scale = isCenter ? 1 : Math.max(0.55, 1 - abs * 0.16);
          const rotY = isCenter ? 0 : off < 0 ? 28 : -28;
          const z = isCenter ? 220 : 120 - abs * 40;
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
              onClick={() => !isCenter && select(t.id)}
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
