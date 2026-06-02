import React, { useRef } from "react";

interface Props {
  ariaLabel: string;
  dataAttr?: string;
  /** Width of the controlled panel at drag start. */
  getStartWidth: () => number;
  /** Apply a new width given the start width and the horizontal pointer delta. */
  onResize: (startWidth: number, dx: number) => void;
}

/**
 * A resize handle that lives in the black gutter *between* two rounded panel
 * cards (not clipped inside one of them). Renders a longer vertical pill that's
 * faintly visible at rest and brightens on hover/drag — Spotify-style. The
 * panel-width math is delegated to `onResize` so the same handle drives the
 * sidebar (grows right: +dx) and the preview panel (grows left: -dx).
 */
export function GutterResizer({
  ariaLabel,
  dataAttr,
  getStartWidth,
  onResize,
}: Props): React.JSX.Element {
  const start = useRef<{ x: number; w: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    start.current = { x: e.clientX, w: getStartWidth() };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const s = start.current;
    if (!s) return;
    onResize(s.w, e.clientX - s.x);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!start.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    start.current = null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="group relative z-10 w-2 self-stretch shrink-0 flex items-center justify-center cursor-col-resize"
      {...(dataAttr ? { [dataAttr]: "" } : {})}
    >
      {/* Runs the full height of the cards; invisible until hovered. */}
      <div className="h-full w-[3px] rounded-full bg-transparent group-hover:bg-text-secondary group-active:bg-accent transition-colors" />
    </div>
  );
}
