import React, { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { type List } from "@/api/lists";
import { useListStore } from "@/stores/lists";
import { useSidebarPanelStore } from "@/stores/sidebar-panel";
import { SidebarItemContextMenu } from "@/components/SidebarItemContextMenu";
import { DeleteSidebarItemDialog } from "@/components/DeleteSidebarItemDialog";
import { ListCoverMosaic, useListCovers } from "@/components/Sidebar/ListCoverMosaic";

function SidebarListRow({
  list,
  active,
  onClick,
  onDeleted,
}: {
  list: List;
  active: boolean;
  onClick: () => void;
  onDeleted?: () => void;
}): React.JSX.Element {
  // The inner `list-drop:N` droppable exists ONLY to catch track-drag drops.
  // When a list itself is being dragged (for reorder), the inner droppable
  // must stay inert — otherwise dnd-kit's collision detection picks it over
  // the outer SortableContext, stealing the "over" target and killing the
  // row-shifting animation. Read the active drag id from context and gate
  // the droppable on it.
  const { active: activeDrag } = useDndContext();
  const activeIsTrack = typeof activeDrag?.id === "string" && activeDrag.id.startsWith("track:");
  const { setNodeRef, isOver } = useDroppable({
    id: `list-drop:${list.id}`,
    disabled: !activeIsTrack,
  });
  const rename = useListStore((s) => s.rename);
  const remove = useListStore((s) => s.remove);
  const collapsed = useSidebarPanelStore((s) => s.collapsed);
  const { covers, count } = useListCovers(list.id);

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const committedRef = useRef(false);

  function startRename(): void {
    committedRef.current = false;
    setDraftName(list.name);
    setRenaming(true);
  }

  async function commitRename(): Promise<void> {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = draftName.trim();
    setRenaming(false);
    if (!trimmed || trimmed === list.name) return;
    try {
      await rename(list.id, trimmed);
    } catch (e) {
      alert(`Failed to rename: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function cancelRename(): void {
    committedRef.current = true;
    setRenaming(false);
  }

  async function confirmDelete(): Promise<void> {
    setDeleteOpen(false);
    try {
      await remove(list.id);
      onDeleted?.();
    } catch (e) {
      alert(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (renaming) {
    return (
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
          onBlur={() => {
            void commitRename();
          }}
          className="w-full bg-bg-elevated border border-accent rounded-md px-2 py-1 text-sm focus:outline-none"
        />
      </div>
    );
  }

  return (
    <>
      <SidebarItemContextMenu onRename={startRename} onDelete={() => setDeleteOpen(true)}>
        <button
          ref={setNodeRef}
          type="button"
          onClick={onClick}
          title={collapsed ? list.name : undefined}
          className={[
            collapsed
              ? "w-full py-1 rounded-md flex items-center justify-center"
              : "w-full px-2 py-1.5 text-left rounded-md flex items-center gap-3",
            "data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-accent",
            isOver
              ? "bg-accent-soft border-l-2 border-accent text-text-primary"
              : active
                ? "bg-bg-row-active text-accent"
                : "text-text-primary hover:bg-bg-row-hover",
          ].join(" ")}
        >
          <ListCoverMosaic covers={covers} size={52} />
          {!collapsed && (
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="truncate text-[15px] font-medium leading-tight">{list.name}</span>
              <span className="truncate text-[13px] text-text-tertiary leading-tight mt-0.5">
                Playlist · {count} {count === 1 ? "track" : "tracks"}
              </span>
            </span>
          )}
          {!collapsed && isOver && <span className="text-accent">+</span>}
        </button>
      </SidebarItemContextMenu>
      <DeleteSidebarItemDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete List "${list.name}"?`}
        description="The list is removed but member tracks stay in your library."
        onConfirm={confirmDelete}
      />
    </>
  );
}

function SortableListRow({
  list,
  active,
  onClick,
  onDeleted,
}: {
  list: List;
  active: boolean;
  onClick: () => void;
  onDeleted?: () => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `list:${list.id}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SidebarListRow list={list} active={active} onClick={onClick} onDeleted={onDeleted} />
    </div>
  );
}

export function ListsSection({ activeListId }: { activeListId: number | null }): React.JSX.Element {
  const navigate = useNavigate();
  const allLists = useListStore((s) => s.all);
  const createList = useListStore((s) => s.create);

  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  const collapsed = useSidebarPanelStore((s) => s.collapsed);
  const userLists = useMemo(() => allLists.filter((l) => l.kind !== "system"), [allLists]);

  function onAddListClick(): void {
    setNewListName("");
    setAddingList(true);
  }

  async function commitNewList(): Promise<void> {
    const name = newListName.trim();
    if (!name) {
      setAddingList(false);
      return;
    }
    try {
      const created = await createList(name);
      setAddingList(false);
      setNewListName("");
      navigate(`/lists/${created.id}`);
    } catch (e) {
      alert(`Failed to create list: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function cancelNewList(): void {
    setAddingList(false);
    setNewListName("");
  }

  return (
    <div>
      <header
        className={
          collapsed ? "mb-1 flex items-center justify-center" : "px-3 mb-1 flex items-center justify-between"
        }
      >
        {!collapsed && <span className="beatos-eyebrow">Lists</span>}
        <button
          type="button"
          onClick={onAddListClick}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Add List"
          title="Add List"
        >
          <Plus size={collapsed ? 18 : 12} />
        </button>
      </header>
      {addingList && (
        <div className="px-3 py-1">
          <input
            autoFocus
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNewList();
              else if (e.key === "Escape") cancelNewList();
            }}
            onBlur={commitNewList}
            placeholder="List name"
            className="w-full bg-bg-elevated border border-border-subtle rounded-md px-2 py-1 text-sm focus:outline-none focus:border-accent"
          />
        </div>
      )}
      <SortableContext
        items={userLists.map((l) => `list:${l.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {userLists.map((l) => (
          <SortableListRow
            key={l.id}
            list={l}
            active={activeListId === l.id}
            onClick={() => navigate(`/lists/${l.id}`)}
            onDeleted={() => {
              if (activeListId === l.id) {
                navigate("/");
              }
            }}
          />
        ))}
      </SortableContext>
    </div>
  );
}
