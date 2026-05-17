import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { useDroppable } from "@dnd-kit/core";

import { useSourceStore } from "@/stores/sources";
import { useListStore } from "@/stores/lists";
import { useTrashStore } from "@/stores/trash";
import { type List } from "@/api/lists";
import { SourceRow } from "@/components/SourceRow";
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
  const { setNodeRef, isOver } = useDroppable({ id: `list:${list.id}` });
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
            onBlur={() => { void commitRename(); }}
            className="w-full bg-bg-elevated border border-accent rounded-md px-2 py-1 text-sm focus:outline-none"
          />
        </div>
      </>
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

export function SidebarPanel(): React.JSX.Element {
  const sources = useSourceStore((s) => s.all);
  const activeFilter = useSourceStore((s) => s.activeFilter);
  const setFilter = useSourceStore((s) => s.setFilter);
  const refreshSources = useSourceStore((s) => s.refresh);

  const allLists = useListStore((s) => s.all);
  const refreshLists = useListStore((s) => s.refresh);
  const createList = useListStore((s) => s.create);

  const trashCount = useTrashStore((s) => s.list.length);
  const refreshTrash = useTrashStore((s) => s.refresh);

  const navigate = useNavigate();
  const location = useLocation();
  const listRouteMatch = matchPath("/lists/:id", location.pathname);
  const activeListId = listRouteMatch ? Number(listRouteMatch.params.id) : null;
  const onListRoute = activeListId != null;

  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  useEffect(() => {
    refreshSources();
    refreshLists();
    void refreshTrash();
    const id = setInterval(() => refreshSources(), 5000);
    return () => clearInterval(id);
  }, [refreshSources, refreshLists, refreshTrash]);

  const userLists = useMemo(() => allLists.filter((l) => l.kind !== "system"), [allLists]);
  const allBeats = useMemo(() => allLists.find((l) => l.kind === "system"), [allLists]);
  const totalTracks = useMemo(
    () => sources.reduce((a, s) => a + s.track_count, 0),
    [sources]
  );

  function onAddSource(): void {
    navigate("/settings");
  }

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
    <aside className="w-60 flex-shrink-0 border-r border-border-subtle overflow-y-auto py-3 flex flex-col gap-4">
      <div>
        <header className="px-3 mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
            Sources
          </span>
          <button
            type="button"
            onClick={onAddSource}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Add Source"
          >
            <Plus size={12} />
          </button>
        </header>
        {allBeats && (
          <SourceRow
            source={{
              id: -1,
              name: "All Beats",
              root_path: "",
              position: -1,
              created_at: "",
              status: "online",
              track_count: totalTracks,
            }}
            active={!onListRoute && activeFilter === null}
            onClick={() => {
              setFilter(null);
              navigate("/");
            }}
          />
        )}
        {sources.map((s) => (
          <SourceRow
            key={s.id}
            source={s}
            active={!onListRoute && activeFilter === s.id}
            onClick={() => {
              setFilter(s.id);
              navigate("/");
            }}
            onDeleted={() => {
              if (activeFilter === s.id) {
                setFilter(null);
                navigate("/");
              }
            }}
          />
        ))}
      </div>

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
        {userLists.map((l) => (
          <SidebarListRow
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
      </div>
      <div>
        <header className="px-3 mb-1">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
            Trash
          </span>
        </header>
        <button
          type="button"
          data-trash-link
          onClick={() => navigate("/trash")}
          className={[
            "w-full px-3 py-1.5 text-left text-sm rounded-md flex items-center gap-2",
            location.pathname === "/trash"
              ? "bg-bg-row-active text-accent"
              : "text-text-primary hover:bg-bg-row-hover",
          ].join(" ")}
        >
          <Trash2 size={14} />
          <span className="flex-1">Trash</span>
          {trashCount > 0 && (
            <span className="text-[10px] text-text-tertiary">{trashCount}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
