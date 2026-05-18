import React, { useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTrackQueryStore } from "@/stores/track-query";
import { useColumnWidthStore } from "@/stores/column-widths";
import { ColumnResizer } from "@/components/ColumnResizer";

export function TableHeader(): React.JSX.Element {
  const sortBy = useTrackQueryStore((s) => s.sortBy);
  const sortDir = useTrackQueryStore((s) => s.sortDir);
  const toggleSort = useTrackQueryStore((s) => s.toggleSort);
  const widths = useColumnWidthStore((s) => s.widths);

  const titleRef = useRef<HTMLButtonElement>(null);

  function getTitleRenderedWidth(): number {
    return titleRef.current?.getBoundingClientRect().width ?? 160;
  }

  const titleStyle: React.CSSProperties =
    widths.title === 0 ? {} : { width: widths.title, flexShrink: 0 };
  const titleClass = widths.title === 0 ? "flex-1 min-w-0" : "";

  return (
    <div
      role="row"
      className="h-9 px-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary border-b border-border-subtle bg-bg-base flex-shrink-0"
      style={{ minWidth: "min-content" }}
    >
      {/* Cover thumbnail slot (play button now overlays the cover in TrackRow) */}
      <button
        type="button"
        disabled
        className="w-12 flex-shrink-0 cursor-default"
      />

      {/* Title */}
      <button
        ref={titleRef}
        type="button"
        data-column="title"
        onClick={() => toggleSort("title")}
        style={titleStyle}
        className={`${titleClass} truncate flex items-center gap-1 hover:text-text-secondary cursor-pointer`}
      >
        <span>Title</span>
        {sortBy === "title" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>

      <ColumnResizer
        columnKey="title"
        currentWidth={widths.title}
        getCurrentRenderedWidth={getTitleRenderedWidth}
      />

      {/* BPM */}
      <button
        type="button"
        data-column="bpm"
        onClick={() => toggleSort("bpm")}
        style={{ width: widths.bpm, flexShrink: 0 }}
        className="truncate flex items-center gap-1 hover:text-text-secondary cursor-pointer"
      >
        <span>BPM</span>
        {sortBy === "bpm" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>

      <ColumnResizer columnKey="bpm" currentWidth={widths.bpm} />

      {/* Key */}
      <button
        type="button"
        data-column="key_signature"
        onClick={() => toggleSort("key_signature")}
        style={{ width: widths.key, flexShrink: 0 }}
        className="truncate flex items-center gap-1 hover:text-text-secondary cursor-pointer"
      >
        <span>Key</span>
        {sortBy === "key_signature" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>

      <ColumnResizer columnKey="key" currentWidth={widths.key} />

      {/* Genre */}
      <button
        type="button"
        data-column="genre"
        onClick={() => toggleSort("genre")}
        style={{ width: widths.genre, flexShrink: 0 }}
        className="truncate flex items-center gap-1 hover:text-text-secondary cursor-pointer"
      >
        <span>Genre</span>
        {sortBy === "genre" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>

      <ColumnResizer columnKey="genre" currentWidth={widths.genre} />

      {/* Updated — last column; absorbs remaining horizontal space so the
          table fills the container width without clipping. min-width keeps
          the header label readable on tight layouts. */}
      <button
        type="button"
        data-column="updated_at"
        onClick={() => toggleSort("updated_at")}
        className="flex-1 min-w-[80px] truncate flex items-center gap-1 hover:text-text-secondary cursor-pointer text-left"
      >
        <span>Updated</span>
        {sortBy === "updated_at" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </button>
    </div>
  );
}
