import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { Track } from "@/api/tracks";

interface Props {
  tracks: Track[];
  renderRow: (track: Track, index: number) => React.ReactNode;
}

const ROW_HEIGHT = 64; // h-16

export function VirtualTrackList({ tracks, renderRow }: Props): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  return (
    // `min-width: min-content` on the parentRef AND the inner virtual container
    // both. Without it on the parent, flex-col cross-axis stretch would size
    // parent to the shared wrapper's CLIENT width, and `overflow-y: auto`
    // would then promote `overflow-x` to `auto` (CSS rule), creating a second
    // X scrollbar that the body uses independently of the header. With it,
    // parent stretches to the shared wrapper's CONTENT width — same as
    // TableHeader — so the only X scrollbar is the shared wrapper's, and
    // dragging body↔header stays in sync.
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto beatos-scroll"
      style={{ minWidth: "min-content" }}
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
