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

  return (
    <div
      data-column-resizer={columnKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="w-1 h-full flex-shrink-0 cursor-col-resize hover:bg-accent/30 active:bg-accent/60"
    />
  );
}
