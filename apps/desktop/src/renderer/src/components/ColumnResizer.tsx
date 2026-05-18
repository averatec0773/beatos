import React, { useRef } from "react";
import { useColumnWidthStore, type ColumnKey } from "@/stores/column-widths";

interface Props {
  columnKey: ColumnKey;
  currentWidth: number;
  getCurrentRenderedWidth?: () => number;
}

export function ColumnResizer({ columnKey, currentWidth, getCurrentRenderedWidth }: Props): React.JSX.Element {
  const startX = useRef(0);
  const startW = useRef(0);
  const dragging = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = currentWidth === 0 && getCurrentRenderedWidth
      ? getCurrentRenderedWidth()
      : currentWidth;
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    useColumnWidthStore.getState().setWidth(columnKey, startW.current + delta);
  }

  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
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
      onPointerUp={onPointerUp}
      className="group absolute top-0 bottom-0 right-0 w-3 -mr-1.5 cursor-col-resize z-10 select-none flex items-center justify-center"
    >
      <div className="h-4 w-px bg-text-tertiary group-hover:bg-accent group-hover:w-0.5 group-active:bg-accent transition-all" />
    </div>
  );
}
