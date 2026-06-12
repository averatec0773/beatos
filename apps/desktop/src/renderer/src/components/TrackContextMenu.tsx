import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Edit, Folder, Trash2, ListPlus, ListMinus, Share2 } from "lucide-react";

import { platform } from "@/platform";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useListStore } from "@/stores/lists";

interface Props {
  trackId: number;
  audioPath: string | null;
  currentListId?: number | null;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
  onRemoveFromList?: () => void;
  children: React.ReactNode;
}

export function TrackContextMenu({
  trackId,
  audioPath,
  currentListId,
  onEdit,
  onDelete,
  onExport,
  onRemoveFromList,
  children,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  // IMPORTANT: select the stable `all` array, then derive userLists with useMemo.
  // Inline `s.all.filter(...)` would return a new array each call, causing
  // useSyncExternalStore to spin in an infinite re-render loop.
  const allLists = useListStore((s) => s.all);
  const addToList = useListStore((s) => s.addTrack);
  const removeFromList = useListStore((s) => s.removeTrack);
  const userLists = useMemo(() => allLists.filter((l) => l.kind !== "system"), [allLists]);

  function onReveal(): void {
    if (audioPath) platform.revealInFinder(audioPath);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onEdit}>
          <Edit size={14} className="mr-2" /> {t("contextMenu.edit")}
        </ContextMenuItem>
        {userLists.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ListPlus size={14} className="mr-2" /> {t("contextMenu.addToList")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {userLists.map((l) => (
                <ContextMenuItem key={l.id} onClick={() => addToList(l.id, trackId)}>
                  {l.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {currentListId != null && (
          <ContextMenuItem
            onClick={async () => {
              await removeFromList(currentListId, trackId);
              onRemoveFromList?.();
            }}
          >
            <ListMinus size={14} className="mr-2" /> {t("contextMenu.removeFromList")}
          </ContextMenuItem>
        )}
        <ContextMenuItem disabled={!audioPath} onClick={onReveal}>
          <Folder size={14} className="mr-2" /> {t("contextMenu.revealInFinder")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onExport}>
          <Share2 size={14} className="mr-2" /> {t("contextMenu.exportToPlatform")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-danger" onClick={onDelete}>
          <Trash2 size={14} className="mr-2" /> {t("contextMenu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
