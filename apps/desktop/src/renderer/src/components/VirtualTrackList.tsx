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
      {/* Inner uses min-width: min-content (NOT max-content) — min-content
          equals the smallest width where columns don't break (fixed widths +
          flex-1 min-w). Header/row pin to this same value via flex-col
          stretch, so they stay aligned. max-content forced natural content
          width always-on, which surfaced a spurious horizontal scrollbar in
          the default layout — min-content only scrolls when the user actually
          widens columns past the viewport. Shared overflow-x-auto wrapper
          (in TrackListPanel) syncs header + body scroll. */}
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
