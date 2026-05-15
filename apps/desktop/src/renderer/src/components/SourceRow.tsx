import React from "react";
import type { Source } from "@/api/sources";

interface Props {
  source: Source;
  active: boolean;
  onClick: () => void;
}

export function SourceRow({ source, active, onClick }: Props): React.JSX.Element {
  const isOffline = source.status === "offline";
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left",
        active ? "bg-bg-row-active text-accent" : "text-text-primary hover:bg-bg-row-hover",
        isOffline ? "opacity-60" : "",
      ].join(" ")}
    >
      <span className="w-3 inline-block">{active ? "×" : "·"}</span>
      <span className="flex-1 truncate">{source.name}</span>
      {isOffline ? (
        <span className="text-[10px] uppercase text-text-tertiary italic">offline</span>
      ) : (
        <span className="text-[11px] text-text-tertiary tabular-nums">{source.track_count}</span>
      )}
    </button>
  );
}
