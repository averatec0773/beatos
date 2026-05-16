import React, { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

  const navigate = useNavigate();

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
  function onAddList(): void {
    navigate("/settings");
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
            active={activeFilter === null}
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
            active={activeFilter === s.id}
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
            onClick={onAddList}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Add List"
          >
            <Plus size={12} />
          </button>
        </header>
        {userLists.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => navigate(`/lists/${l.id}`)}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-row-hover rounded-md"
          >
            {l.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
