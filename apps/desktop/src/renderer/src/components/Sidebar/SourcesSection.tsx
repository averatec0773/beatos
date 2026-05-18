import React, { useMemo } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { type Source } from "@/api/sources";
import { useSourceStore } from "@/stores/sources";
import { useListStore } from "@/stores/lists";
import { SourceRow } from "@/components/SourceRow";



function SortableSourceRow({
  source,
  active,
  onClick,
  onDeleted,
}: {
  source: Source;
  active: boolean;
  onClick: () => void;
  onDeleted?: () => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `source:${source.id}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SourceRow source={source} active={active} onClick={onClick} onDeleted={onDeleted} />
    </div>
  );
}

export function SourcesSection({ onListRoute }: { onListRoute: boolean }): React.JSX.Element {
  const navigate = useNavigate();
  const sources = useSourceStore((s) => s.all);
  const activeFilter = useSourceStore((s) => s.activeFilter);
  const setFilter = useSourceStore((s) => s.setFilter);

  const hasSystemList = useListStore((s) => s.all.some((l) => l.kind === "system"));
  const totalTracks = useMemo(() => sources.reduce((a, s) => a + s.track_count, 0), [sources]);

  return (
    <div>
      <header className="px-3 mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
          Sources
        </span>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Add Source"
        >
          <Plus size={12} />
        </button>
      </header>
      {hasSystemList && (
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
      <SortableContext
        items={sources.map((s) => `source:${s.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {sources.map((s) => (
          <SortableSourceRow
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
      </SortableContext>
    </div>
  );
}
