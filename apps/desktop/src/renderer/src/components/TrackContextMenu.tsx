import React from "react";
import { Edit, Folder, Trash2, ListPlus } from "lucide-react";

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
  trackTitle: string;
  audioPath: string | null;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export function TrackContextMenu({
  trackId,
  trackTitle,
  audioPath,
  onEdit,
  onDelete,
  children,
}: Props): React.JSX.Element {
  const userLists = useListStore((s) => s.all.filter((l) => l.kind !== "system"));
  const addToList = useListStore((s) => s.addTrack);

  function onReveal(): void {
    if (audioPath) window.beatos.revealInFinder(audioPath);
  }

  function onConfirmDelete(): void {
    if (confirm(`Delete "${trackTitle}"?`)) onDelete();
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onEdit}>
          <Edit size={14} className="mr-2" /> Edit
        </ContextMenuItem>
        {userLists.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ListPlus size={14} className="mr-2" /> Add to list
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
        <ContextMenuItem disabled={!audioPath} onClick={onReveal}>
          <Folder size={14} className="mr-2" /> Reveal in Finder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-danger" onClick={onConfirmDelete}>
          <Trash2 size={14} className="mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
