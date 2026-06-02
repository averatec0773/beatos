import React from "react";
import { useDraggable } from "@dnd-kit/core";

import { CoverImage } from "@/components/CoverImage";
import { TrackRowPlayButton } from "@/components/TrackRowPlayButton";
import type { Track } from "@/api/tracks";
import { formatRowDate } from "@/lib/format-row-date";
import { useColumnWidthStore } from "@/stores/column-widths";
import { getGridTemplateColumns, TABLE_COL_GAP } from "@/lib/table-layout";
import { formatVocabLabel } from "@/data/vocab-label";
import { useVocabLocaleStore } from "@/stores/vocab-locale";

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

function TrackRowImpl({
  track,
  coverAssetId,
  selected,
  isMultiSelected = false,
  onSelect,
  onOpen,
}: Props): React.JSX.Element {
  const widths = useColumnWidthStore((s) => s.widths);
  const gridCols = getGridTemplateColumns(widths);
  const vocabLocale = useVocabLocaleStore((s) => s.locale);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `track:${track.id}`,
    data: { trackId: track.id, title: track.title },
  });

  const highlighted = isMultiSelected || selected;

  return (
    // CSS Grid row — uses the EXACT same `gridTemplateColumns` as TableHeader
    // so every cell aligns vertically across rows regardless of inner content
    // (single-line title vs title+producer subtitle, etc.). `min-width:
    // min-content` lets the row grow past the viewport when the user pins a
    // column wider than the section, which the shared scroll wrapper then
    // exposes via horizontal scroll synced with the header.
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
      style={{ gridTemplateColumns: gridCols, columnGap: TABLE_COL_GAP, minWidth: "min-content" }}
      className={`h-16 px-4 grid items-center cursor-grab active:cursor-grabbing cursor-pointer relative select-none transition-[transform,background-color] [transition-duration:var(--dur-hover)] [transition-timing-function:var(--spring)]
        ${isDragging ? "opacity-50" : ""}
        ${
          highlighted
            ? "bg-accent-soft text-text-primary"
            : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary hover:-translate-y-[3px] hover:shadow-[0_14px_30px_-18px_rgba(0,0,0,.9)] hover:z-10 motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none"
        }`}
    >
      {highlighted && !isDragging && (
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
      )}

      {/* Cover + per-row play overlay. Fixed 48 × 48 — matches the cover grid
          track width exactly. */}
      <div className="group relative w-[52px] h-[52px]" data-column-cell="cover">
        <CoverImage assetId={coverAssetId} size={52} />
        <TrackRowPlayButton trackId={track.id} hasAudio={track.has_audio ?? false} />
      </div>

      <div className="min-w-0 flex flex-col justify-center" data-column-cell="title">
        <span data-track-title className="text-sm font-medium text-text-primary truncate">
          {track.title}
        </span>
        <span className="text-xs text-text-tertiary truncate">
          {[...(track.producer ?? [])].sort((a, b) => a.localeCompare(b)).join(", ")}
        </span>
      </div>

      <div className="text-left font-mono text-xs min-w-0 truncate" data-column-cell="bpm">
        {track.bpm ?? "—"}
      </div>

      <div className="truncate text-xs min-w-0" data-column-cell="key_signature">
        {track.key_signature ?? "—"}
      </div>

      <div className="truncate text-xs min-w-0" data-column-cell="genre">
        {track.genre && track.genre.length > 0
          ? `${formatVocabLabel(track.genre[0], "genre", vocabLocale)}${
              track.genre.length > 1 ? ` +${track.genre.length - 1}` : ""
            }`
          : "—"}
      </div>

      <div
        className="truncate font-mono text-xs text-text-tertiary min-w-0"
        data-column-cell="updated_at"
      >
        {formatRowDate(track.updated_at)}
      </div>
    </div>
  );
}

// `visible = list` (the track store array) keeps each track object referentially
// stable across selection / search / player-tick re-renders of TrackListPanel, so
// a reference compare on `track` plus the scalar props is enough. The `onSelect` /
// `onOpen` closures are recreated every parent render but TrackRow only invokes
// them — never renders from them — so we deliberately ignore them here.
export const TrackRow = React.memo(
  TrackRowImpl,
  (prev, next) =>
    prev.track === next.track &&
    prev.coverAssetId === next.coverAssetId &&
    prev.selected === next.selected &&
    prev.isMultiSelected === next.isMultiSelected,
);
