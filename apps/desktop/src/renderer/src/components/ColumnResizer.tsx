import React, { useRef } from "react";
import { useColumnWidthStore, type ColumnKey } from "@/stores/column-widths";

interface Props {
  columnKey: ColumnKey;
  currentWidth: number;
  getCurrentRenderedWidth?: () => number;
}

// Pixel threshold a pointer must travel before a drag is considered real.
// Below this, the event is treated as a click and no width is written, which
// keeps a default `1fr` column (widths.title === 0) from collapsing to a fixed
// pixel value the instant the user accidentally clicks the resizer overlay.
const DRAG_THRESHOLD_PX = 3;

export function ColumnResizer({ columnKey, currentWidth, getCurrentRenderedWidth }: Props): React.JSX.Element {
  const startX = useRef(0);
  const startW = useRef(0);
  const dragging = useRef(false);
  const committed = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = currentWidth === 0 && getCurrentRenderedWidth
      ? getCurrentRenderedWidth()
      : currentWidth;
    dragging.current = true;
    committed.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    // Real-button-state guard: even if `dragging.current` is stale (lost
    // pointerup, OS-cancelled capture), e.buttons reflects current hardware
    // state. No button pressed → user is just hovering; bail and self-heal.
    if (e.buttons === 0) {
      dragging.current = false;
      return;
    }
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    // Until the user has actually moved past the threshold, don't write —
    // that prevents a click-without-drag from flipping a `1fr` flex column
    // into a fixed-pixel width (visible as a sudden shrink of the Title
    // column after clicking the divider).
    if (!committed.current && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    committed.current = true;
    useColumnWidthStore.getState().setWidth(columnKey, startW.current + delta);
  }

  function endDrag(e: React.PointerEvent) {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // Absolute-positioned inside its parent header cell (a `position: relative`
  // wrapper). Anchored to the cell's right edge so the resizer maps 1:1 to
  // the column it controls. The hit area extends slightly past the right
  // edge (negative margin) so a user can grab the boundary even when columns
  // are tightly packed. The divider line uses `bg-text-tertiary` (vs the
  // older `bg-border-subtle`) so it's actually visible at rest — the
  // previous styling was so subtle users couldn't find the drag target.
  return (
    <div
      data-column-resizer={columnKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      className="group absolute top-0 bottom-0 right-0 w-3 -mr-1.5 cursor-col-resize z-10 select-none flex items-center justify-center"
    >
      <div className="h-4 w-px bg-text-tertiary group-hover:bg-accent group-hover:w-0.5 group-active:bg-accent transition-all" />
    </div>
  );
}
