import React from "react";

import type { Track } from "@/api/tracks";

interface Props {
  track: Track;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export function TrackRow({ track, selected, onSelect, onOpen }: Props): React.JSX.Element {
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={`h-11 px-4 flex items-center cursor-pointer relative gap-4 text-sm
        ${selected ? "bg-bg-row-selected text-text-primary" : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"}`}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />}
      <div className="flex-1 truncate">{track.title}</div>
      <div className="w-16 text-right font-mono text-xs">{track.bpm ?? "—"}</div>
      <div className="w-20 truncate text-xs">{track.key_signature ?? "—"}</div>
      <div className="w-32 truncate text-xs">{track.genre ?? "—"}</div>
    </div>
  );
}
