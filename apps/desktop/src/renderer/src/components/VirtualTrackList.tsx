import React, { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { Track } from "@/api/tracks";

interface Props {
  tracks: Track[];
  renderRow: (track: Track, index: number) => React.ReactNode;
  /**
   * Called whenever the body's horizontal scroll position changes. The parent
   * uses this to keep the (separate) header element's scrollLeft in sync,
   * giving us a single X-scroll source of truth: the body. Without this, the
   * old layout had TWO independent X-scroll containers — shared wrapper and
   * this list — and they desynchronized whenever the user dragged in the
   * body area (only the body scrolled; header stayed put).
   */
  onScrollLeftChange?: (scrollLeft: number) => void;
  /** Body scroll element exposed so the parent can drive it from the header. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * Fired when the empty scroll background (below the last row) is clicked —
   * i.e. the click target is the scroll container itself, not a row. The
   * parent uses this to deselect the focused/selected track.
   */
  onBackgroundClick?: () => void;
}

const ROW_HEIGHT = 64; // h-16

export function VirtualTrackList({
  tracks,
  renderRow,
  onScrollLeftChange,
  scrollRef,
  onBackgroundClick,
}: Props): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null);

  // Mirror our ref into the parent's ref so the parent can drive scrollLeft
  // from header events.
  useEffect(() => {
    if (scrollRef) scrollRef.current = parentRef.current;
    return () => {
      if (scrollRef) scrollRef.current = null;
    };
  }, [scrollRef]);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  // Pipe X-scroll up to the parent so it can sync the table header.
  useEffect(() => {
    const el = parentRef.current;
    if (!el || !onScrollLeftChange) return;
    const onScroll = (): void => onScrollLeftChange(el.scrollLeft);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScrollLeftChange]);

  return (
    // The body is the ONLY X-scroll container in the table (the header sits
    // outside and gets `scrollLeft` synced via JS). Inner div is positioned
    // relative so the absolutely-positioned virtual rows establish a scroll
    // width — each row's grid-template-columns + `min-width: min-content`
    // pushes its right edge past the parent's clientWidth, which is what
    // makes `overflow: auto` engage horizontally.
    <div
      ref={parentRef}
      className="flex-1 overflow-auto beatos-scroll"
      onClick={(e) => {
        // Only fire for clicks on the empty background (target is the scroll
        // container itself), not clicks that bubbled up from a row.
        if (e.target === e.currentTarget) onBackgroundClick?.();
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          minWidth: "min-content",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderRow(tracks[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
