import React from "react";

import { formatSavedAgo, type SaveState } from "@/lib/track-editor-helpers";

export interface SaveIndicatorProps {
  titleEmpty: boolean;
  saveState: SaveState;
  saveErrorMsg: string | null;
  lastSavedAt: number | null;
  onRetry: () => void;
}

export function SaveIndicator({
  titleEmpty,
  saveState,
  saveErrorMsg,
  lastSavedAt,
  onRetry,
}: SaveIndicatorProps): React.JSX.Element | null {
  if (titleEmpty) {
    return (
      <span data-save-status="title-required" className="text-danger text-xs">
        Title required to save
      </span>
    );
  }
  if (saveState === "saving") {
    return (
      <span data-save-status="saving" className="text-text-tertiary text-xs">
        Saving…
      </span>
    );
  }
  if (saveState === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        data-save-status="error"
        className="text-danger text-xs hover:underline"
        title={saveErrorMsg ?? undefined}
      >
        Save failed — retry
      </button>
    );
  }
  if (saveState === "saved" && lastSavedAt != null) {
    return (
      <span data-save-status="saved" className="text-text-tertiary text-xs">
        Saved · {formatSavedAgo(lastSavedAt)}
      </span>
    );
  }
  return null;
}
