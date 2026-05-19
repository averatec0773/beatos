import React from "react";

interface OfflineBadgeProps {
  missing: boolean | undefined | null;
  className?: string;
}

export function OfflineBadge({ missing, className = "" }: OfflineBadgeProps): React.JSX.Element | null {
  if (!missing) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-bg-elevated text-text-tertiary border border-border-subtle ${className}`}
      title="File not found on disk"
    >
      Offline
    </span>
  );
}
