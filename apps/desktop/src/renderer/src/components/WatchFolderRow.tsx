import React from "react";
import { Folder, X } from "lucide-react";

import { WatchFolder } from "@/api/watcher";

interface Props {
  folder: WatchFolder;
  onRemove: () => void;
}

export function WatchFolderRow({ folder, onRemove }: Props): React.JSX.Element {
  return (
    <div className="px-4 py-3 flex items-center gap-3 bg-bg-elevated">
      <Folder size={16} className="text-text-tertiary" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate">{folder.path}</div>
        <div className="text-xs text-text-tertiary">Auto-import as drafts · watching</div>
      </div>
      <button
        onClick={onRemove}
        className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:text-danger hover:bg-bg-row-hover"
        aria-label="Remove watch folder"
      >
        <X size={14} />
      </button>
    </div>
  );
}
