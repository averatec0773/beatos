import React from "react";
import { ChevronDown, Check, Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLibraryStore } from "@/stores/library";

export function LibrarySwitcher(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const list = useLibraryStore((s) => s.list);
  const switchTo = useLibraryStore((s) => s.switchTo);
  const init = useLibraryStore((s) => s.init);

  async function onNewLibrary() {
    const picked = await window.beatos.openFolderDialog();
    if (!picked) return;
    await init(picked);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-sm font-bold text-text-primary hover:opacity-80">
          <span className="truncate max-w-[150px]">{active?.name ?? "Library"}</span>
          <ChevronDown size={14} className="text-text-tertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {list.length === 0 ? (
          <DropdownMenuItem disabled>No libraries</DropdownMenuItem>
        ) : (
          list.map((lib) => {
            const isActive = active?.root_path === lib.root_path;
            return (
              <DropdownMenuItem
                key={lib.root_path}
                onClick={() => !isActive && switchTo(lib.root_path)}
              >
                {isActive && <Check size={14} className="mr-2 text-accent" />}
                <span className={isActive ? "text-text-primary" : "text-text-secondary"}>
                  {lib.name}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNewLibrary}>
          <Plus size={14} className="mr-2" />
          New library…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
