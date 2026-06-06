import React from "react";
import { useTranslation } from "react-i18next";

interface Props {
  count: number;
  title?: string;
}

export function DragOverlayPreview({ count, title }: Props): React.JSX.Element {
  const { t } = useTranslation();
  if (count === 1 && title) {
    return (
      <div className="bg-bg-elevated border-l-2 border-accent rounded-md px-3 py-2 shadow-lg opacity-90 max-w-xs">
        <span className="text-sm text-text-primary truncate block">{title}</span>
      </div>
    );
  }
  return (
    <div className="bg-bg-elevated text-text-primary border border-white/15 rounded-full px-3 py-1 text-xs font-medium shadow-lg">
      {t("dragOverlay.tracks", { count })}
    </div>
  );
}
