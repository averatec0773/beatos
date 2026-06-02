import React from "react";

interface Props {
  count: number;
  title?: string;
}

export function DragOverlayPreview({ count, title }: Props): React.JSX.Element {
  if (count === 1 && title) {
    return (
      <div className="bg-bg-elevated border-l-2 border-accent rounded-md px-3 py-2 shadow-lg opacity-90 max-w-xs">
        <span className="text-sm text-text-primary truncate block">{title}</span>
      </div>
    );
  }
  return (
    <div className="bg-bg-elevated text-text-primary border border-white/15 rounded-full px-3 py-1 text-xs font-medium shadow-lg">
      {count} tracks
    </div>
  );
}
