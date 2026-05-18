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
    <div ref={parentRef} className="flex-1 overflow-y-auto beatos-scroll">
      {/* Inner uses min-width: max-content so rows can grow horizontally past
          the container — selection highlight then extends to the full row
          width instead of truncating at the viewport edge. Horizontal scroll
          is owned by the SHARED wrapper around <TableHeader> + this list. */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          minWidth: "max-content",
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
