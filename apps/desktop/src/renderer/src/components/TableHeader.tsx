import React, { useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTrackQueryStore } from "@/stores/track-query";
import { useColumnWidthStore } from "@/stores/column-widths";
import { ColumnResizer } from "@/components/ColumnResizer";
import { getGridTemplateColumns, TABLE_COL_GAP } from "@/lib/table-layout";

interface SortButtonProps {
  column: "title" | "bpm" | "key_signature" | "genre" | "updated_at";
  label: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

function SortButton({ column, label, buttonRef }: SortButtonProps): React.JSX.Element {
  const sortBy = useTrackQueryStore((s) => s.sortBy);
  const sortDir = useTrackQueryStore((s) => s.sortDir);
  const toggleSort = useTrackQueryStore((s) => s.toggleSort);
  return (
    <button
      ref={buttonRef}
      type="button"
      data-column={column}
      onClick={() => toggleSort(column)}
      className="truncate flex items-center gap-1 hover:text-text-secondary cursor-pointer text-left min-w-0"
    >
      <span>{label}</span>
      {sortBy === column &&
        (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
    </button>
  );
}

export function TableHeader(): React.JSX.Element {
  const widths = useColumnWidthStore((s) => s.widths);

  // Measure the title *grid track* (the cell wrapper), not the inner text
  // button — the track is what the `1fr`/px width controls.
  const titleCellRef = useRef<HTMLDivElement>(null);
  function getTitleRenderedWidth(): number {
    return titleCellRef.current?.getBoundingClientRect().width ?? 160;
  }

  // When a *fixed* column (bpm/key/genre) starts resizing, convert title from
  // its flexible `1fr` to its current rendered px so it no longer absorbs the
  // resize. Without this, growing a fixed column shrinks title and slides every
  // column between them leftward — the long-standing "drag right → labels move
  // left" bug. Verified at the layout level via the resize harness.
  function freezeTitle(): void {
    if (useColumnWidthStore.getState().widths.title === 0) {
      const w = getTitleRenderedWidth();
      if (w > 0) useColumnWidthStore.getState().setWidth("title", w);
    }
  }

  const gridCols = getGridTemplateColumns(widths);

  return (
    // CSS Grid header. Same `gridTemplateColumns` as every TrackRow → cell
    // edges line up exactly without flex spacer geometry. ColumnResizer
    // overlays each cell's right edge (`position: absolute`) instead of
    // taking its own grid track.
    <div
      role="row"
      className="h-9 px-4 grid items-center text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary border-b border-border-subtle bg-bg-elevated flex-shrink-0 select-none"
      style={{ gridTemplateColumns: gridCols, columnGap: TABLE_COL_GAP, minWidth: "min-content" }}
    >
      {/* Cover-thumbnail slot — kept as an inert button so the grid track is
          stable and clicks on the header don't hit row contents below. */}
      <button type="button" disabled className="cursor-default" data-column-cell="cover" />

      <div ref={titleCellRef} className="relative min-w-0" data-column-cell="title">
        <SortButton column="title" label="Title" />
        <ColumnResizer
          columnKey="title"
          currentWidth={widths.title}
          getCurrentRenderedWidth={getTitleRenderedWidth}
        />
      </div>

      <div className="relative min-w-0" data-column-cell="bpm">
        <SortButton column="bpm" label="BPM" />
        <ColumnResizer columnKey="bpm" currentWidth={widths.bpm} onResizeStart={freezeTitle} />
      </div>

      <div className="relative min-w-0" data-column-cell="key_signature">
        <SortButton column="key_signature" label="Key" />
        <ColumnResizer columnKey="key" currentWidth={widths.key} onResizeStart={freezeTitle} />
      </div>

      <div className="relative min-w-0" data-column-cell="genre">
        <SortButton column="genre" label="Genre" />
        <ColumnResizer columnKey="genre" currentWidth={widths.genre} onResizeStart={freezeTitle} />
      </div>

      <div className="min-w-0" data-column-cell="updated_at">
        <SortButton column="updated_at" label="Updated" />
      </div>
    </div>
  );
}
