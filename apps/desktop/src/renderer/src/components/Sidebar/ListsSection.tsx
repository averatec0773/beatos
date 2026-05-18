import React, { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { type List } from "@/api/lists";
import { useListStore } from "@/stores/lists";
import { SidebarItemContextMenu } from "@/components/SidebarItemContextMenu";
import { DeleteSidebarItemDialog } from "@/components/DeleteSidebarItemDialog";

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
  const { setNodeRef, isOver } = useDroppable({ id: `list-drop:${list.id}` });
  const rename = useListStore((s) => s.rename);
  const remove = useListStore((s) => s.remove);

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
          className={[
            "w-full px-3 py-1.5 text-left text-sm rounded-md flex items-center justify-between",
            active
              ? "bg-bg-row-active text-accent"
              : isOver
                ? "bg-accent-soft border-l-2 border-accent text-text-primary"
                : "text-text-primary hover:bg-bg-row-hover",
          ].join(" ")}
        >
          <span className="truncate">{list.name}</span>
          {isOver && <span className="text-accent">+</span>}
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
      <header className="px-3 mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
          Lists
        </span>
        <button
          type="button"
          onClick={onAddListClick}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Add List"
        >
          <Plus size={12} />
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
