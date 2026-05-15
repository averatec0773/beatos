import React, { useState } from "react";
import { Trash2 } from "lucide-react";

import { CoverImage } from "@/components/CoverImage";
import type { Track } from "@/api/tracks";

interface Props {
  track: Track;
  coverAssetId: number | null;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

export function TrackRow({
  track,
  coverAssetId,
  selected,
  onSelect,
  onOpen,
  onDelete,
}: Props): React.JSX.Element {
  const [hover, setHover] = useState(false);

  return (
    <div
      role="row"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={`h-12 px-4 flex items-center cursor-pointer relative gap-3 text-sm
        ${selected ? "bg-bg-row-selected text-text-primary" : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"}`}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />}
      <CoverImage assetId={coverAssetId} size={40} className="flex-shrink-0" />
      <div className="flex-1 truncate">{track.title}</div>
      <div className="w-16 text-right font-mono text-xs">{track.bpm ?? "—"}</div>
      <div className="w-20 truncate text-xs">{track.key_signature ?? "—"}</div>
      <div className="w-32 truncate text-xs">{track.genre ?? "—"}</div>
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
