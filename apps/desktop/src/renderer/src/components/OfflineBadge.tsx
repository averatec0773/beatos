import React from "react";

export function OfflineBadge({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-bg-elevated text-text-tertiary border border-border-subtle ${className}`}
      title="The Source containing this file is currently offline"
    >
      Drive offline
    </span>
  );
}
