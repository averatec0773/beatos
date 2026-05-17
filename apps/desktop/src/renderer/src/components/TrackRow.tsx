import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";

import { CoverImage } from "@/components/CoverImage";
import { TrackRowPlayButton } from "@/components/TrackRowPlayButton";
import type { Track } from "@/api/tracks";
import { formatRowDate } from "@/lib/format-row-date";
import { useColumnWidthStore } from "@/stores/column-widths";

interface Props {
  track: Track;
  coverAssetId: number | null;
  selected: boolean;
  isMultiSelected?: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onOpen: () => void;
  onDelete: () => void;
}

export function TrackRow({
  track,
  coverAssetId,
  selected,
  isMultiSelected = false,
  onSelect,
  onOpen,
  onDelete,
}: Props): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const widths = useColumnWidthStore((s) => s.widths);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `track:${track.id}`,
    data: { trackId: track.id, title: track.title },
  });

  const highlighted = isMultiSelected || selected;

  return (
    <div
      role="row"
      data-track-id={track.id}
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={`h-16 px-4 flex items-center cursor-pointer relative gap-3
        ${isDragging ? "opacity-50" : ""}
        ${highlighted ? "bg-bg-row-selected text-text-primary border-l-2 border-accent" : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"}`}
    >
      {highlighted && !isDragging && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
      )}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="group relative w-12 h-12 flex-shrink-0 cursor-grab active:cursor-grabbing"
        aria-label="Drag track"
      >
        <CoverImage assetId={coverAssetId} size={48} />
        <TrackRowPlayButton trackId={track.id} hasAudio={track.has_audio ?? false} />
      </div>
      <div
        className={widths.title === 0 ? "flex-1 min-w-0 flex flex-col justify-center" : "flex flex-col justify-center"}
        style={widths.title === 0 ? undefined : { width: widths.title, flexShrink: 0, minWidth: 0 }}
      >
        <span data-track-title className="text-sm font-medium text-text-primary truncate">{track.title}</span>
        <span className="text-xs text-text-tertiary truncate">
          {track.producer ?? ""}
        </span>
      </div>
      {/* 1px resizer spacer — matches ColumnResizer width so columns stay aligned */}
      <div className="w-1 flex-shrink-0" />
      <div className="text-left font-mono text-xs" style={{ width: widths.bpm, flexShrink: 0 }}>{track.bpm ?? "—"}</div>
      <div className="w-1 flex-shrink-0" />
      <div className="truncate text-xs" style={{ width: widths.key, flexShrink: 0 }}>{track.key_signature ?? "—"}</div>
      <div className="w-1 flex-shrink-0" />
      <div className="truncate text-xs" style={{ width: widths.genre, flexShrink: 0 }}>{track.genre ?? "—"}</div>
      <div className="w-1 flex-shrink-0" />
      <div className="truncate font-mono text-xs text-text-tertiary" style={{ width: widths.updated, flexShrink: 0 }}>
        {formatRowDate(track.updated_at)}
      </div>
      {hover && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:text-danger hover:bg-bg-row-hover"
          aria-label="Delete"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
