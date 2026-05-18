import React from "react";
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
  // onDelete kept in API surface but unused — delete now via right-click context menu only
  onDelete?: () => void;
}

export function TrackRow({
  track,
  coverAssetId,
  selected,
  isMultiSelected = false,
  onSelect,
  onOpen,
}: Props): React.JSX.Element {
  const widths = useColumnWidthStore((s) => s.widths);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `track:${track.id}`,
    data: { trackId: track.id, title: track.title },
  });

  const highlighted = isMultiSelected || selected;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="row"
      data-track-id={track.id}
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      style={{ minWidth: "max-content" }}
      className={`h-16 px-4 flex items-center cursor-grab active:cursor-grabbing cursor-pointer relative gap-3
        ${isDragging ? "opacity-50" : ""}
        ${highlighted ? "bg-bg-row-selected text-text-primary border-l-2 border-accent" : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"}`}
    >
      {highlighted && !isDragging && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
      )}
      <div
        className="group relative w-12 h-12 flex-shrink-0"
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
          {[...(track.producer ?? [])].sort((a, b) => a.localeCompare(b)).join(", ")}
        </span>
      </div>
      {/* Spacer geometry MUST match TableHeader's <ColumnResizer/> exactly
          (w-3 -mx-1) — otherwise the row drifts right of the header by ~8 px
          per spacer once a column is pinned to a fixed pixel width. */}
      <div className="w-3 -mx-1 flex-shrink-0" />
      <div className="text-left font-mono text-xs" style={{ width: widths.bpm, flexShrink: 0 }}>{track.bpm ?? "—"}</div>
      <div className="w-1 flex-shrink-0" />
      <div className="truncate text-xs" style={{ width: widths.key, flexShrink: 0 }}>{track.key_signature ?? "—"}</div>
      <div className="w-1 flex-shrink-0" />
      <div className="truncate text-xs" style={{ width: widths.genre, flexShrink: 0 }}>
        {track.genre && track.genre.length > 0 ? `${track.genre[0]}${track.genre.length > 1 ? ` +${track.genre.length - 1}` : ""}` : "—"}
      </div>
      <div className="w-1 flex-shrink-0" />
      <div className="flex-1 min-w-[80px] truncate font-mono text-xs text-text-tertiary">
        {formatRowDate(track.updated_at)}
      </div>
    </div>
  );
}
