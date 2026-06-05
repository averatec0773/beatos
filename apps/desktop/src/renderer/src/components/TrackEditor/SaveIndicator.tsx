import React from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  if (titleEmpty) {
    return (
      <span data-save-status="title-required" className="text-danger text-xs">
        {t("editor.titleRequired")}
      </span>
    );
  }
  if (saveState === "saving") {
    return (
      <span data-save-status="saving" className="text-text-tertiary text-xs">
        {t("common.saving")}
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
        {t("editor.saveFailed")}
      </button>
    );
  }
  if (saveState === "saved" && lastSavedAt != null) {
    return (
      <span data-save-status="saved" className="text-text-tertiary text-xs">
        {t("editor.saved", { time: formatSavedAgo(lastSavedAt) })}
      </span>
    );
  }
  return null;
}
