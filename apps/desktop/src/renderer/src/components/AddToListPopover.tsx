import React, { useState } from "react";
import { ListPlus } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListStore } from "@/stores/lists";
import { addTracksToList } from "@/lib/add-tracks-to-list";

interface Props {
  trackIds: number[];
  onDone?: () => void;
  /** Hide a list from the picker — typically the current route's list. */
  excludeListId?: number | null;
}

export function AddToListPopover({ trackIds, onDone, excludeListId }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const allLists = useListStore((s) => s.all);
  const userLists = allLists.filter((l) => l.kind === "user" && l.id !== excludeListId);

  async function pick(listId: number): Promise<void> {
    setOpen(false);
    await addTracksToList(listId, trackIds);
    onDone?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-text-primary hover:bg-bg-row-hover whitespace-nowrap"
          data-bulk-add-to-list
        >
          <ListPlus size={14} />
          Add to list
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="p-1 w-56">
        {userLists.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-tertiary">No lists yet</div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {userLists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => void pick(l.id)}
                className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-bg-row-hover truncate"
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
