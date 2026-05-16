import React, { useState } from "react";
import type { Source } from "@/api/sources";
import { SidebarItemContextMenu } from "@/components/SidebarItemContextMenu";
import { DeleteSidebarItemDialog } from "@/components/DeleteSidebarItemDialog";
import { useSourceStore } from "@/stores/sources";

interface Props {
  source: Source;
  active: boolean;
  onClick: () => void;
  onDeleted?: () => void;
}

export function SourceRow({ source, active, onClick, onDeleted }: Props): React.JSX.Element {
  const rename = useSourceStore((s) => s.rename);
  const remove = useSourceStore((s) => s.remove);

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isOffline = source.status === "offline";

  function startRename(): void {
    setDraftName(source.name);
    setRenaming(true);
  }

  async function commitRename(): Promise<void> {
    const trimmed = draftName.trim();
    setRenaming(false);
    if (!trimmed || trimmed === source.name) return;
    try {
      await rename(source.id, trimmed);
    } catch (e) {
      alert(`Failed to rename: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function cancelRename(): void {
    setRenaming(false);
  }

  async function confirmDelete(): Promise<void> {
    setDeleteOpen(false);
    try {
      await remove(source.id);
      onDeleted?.();
    } catch (e) {
      alert(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (renaming) {
    return (
      <>
        <div className="px-3 py-1">
          <input
            autoFocus
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              else if (e.key === "Escape") cancelRename();
            }}
            onBlur={cancelRename}
            className="w-full bg-bg-elevated border border-accent rounded-md px-2 py-1 text-sm focus:outline-none"
          />
        </div>
        <DeleteSidebarItemDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete Source "${source.name}"?`}
          description="Your tracks and files stay where they are — only BeatOS's registration is removed."
          onConfirm={confirmDelete}
        />
      </>
    );
  }

  return (
    <>
      <SidebarItemContextMenu onRename={startRename} onDelete={() => setDeleteOpen(true)}>
        <button
          type="button"
          onClick={onClick}
          className={[
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left",
            active ? "bg-bg-row-active text-accent" : "text-text-primary hover:bg-bg-row-hover",
            isOffline ? "opacity-60" : "",
          ].join(" ")}
        >
          <span className="w-3 inline-block">{active ? "×" : "·"}</span>
          <span className="flex-1 truncate">{source.name}</span>
          {isOffline ? (
            <span className="text-[10px] uppercase text-text-tertiary italic">offline</span>
          ) : (
            <span className="text-[11px] text-text-tertiary tabular-nums">{source.track_count}</span>
          )}
        </button>
      </SidebarItemContextMenu>
      <DeleteSidebarItemDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete Source "${source.name}"?`}
        description="Your tracks and files stay where they are — only BeatOS's registration is removed."
        onConfirm={confirmDelete}
      />
    </>
  );
}
