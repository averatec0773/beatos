import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";

import { useSourceStore } from "@/stores/sources";
import { useListStore } from "@/stores/lists";
import { SourceRow } from "@/components/SourceRow";

export function SidebarPanel(): React.JSX.Element {
  const sources = useSourceStore((s) => s.all);
  const activeFilter = useSourceStore((s) => s.activeFilter);
  const setFilter = useSourceStore((s) => s.setFilter);
  const refreshSources = useSourceStore((s) => s.refresh);

  const allLists = useListStore((s) => s.all);
  const refreshLists = useListStore((s) => s.refresh);
  const createList = useListStore((s) => s.create);

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
    const id = setInterval(() => refreshSources(), 5000);
    return () => clearInterval(id);
  }, [refreshSources, refreshLists]);

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
        {userLists.map((l) => {
          const isActive = activeListId === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => navigate(`/lists/${l.id}`)}
              className={[
                "w-full px-3 py-1.5 text-left text-sm rounded-md",
                isActive ? "bg-bg-row-active text-accent" : "text-text-primary hover:bg-bg-row-hover",
              ].join(" ")}
            >
              {l.name}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
