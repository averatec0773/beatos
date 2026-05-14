import React, { useEffect } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useTrackStore } from "@/stores/tracks";
import { TrackRow } from "@/components/TrackRow";
import { EmptyState } from "@/components/EmptyState";
import { TrackDetailPanel } from "@/routes/TrackDetailPanel";

export function TrackListPanel(): React.JSX.Element {
  const list = useTrackStore((s) => s.list);
  const current = useTrackStore((s) => s.current);
  const refresh = useTrackStore((s) => s.refresh);
  const select = useTrackStore((s) => s.select);
  const createTrack = useTrackStore((s) => s.create);
  const navigate = useNavigate();

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onAddTrack(): Promise<void> {
    const t = await createTrack("Untitled");
    navigate(`/tracks/${t.id}/edit`);
  }

  if (list.length === 0) {
    return (
      <>
        <section className="flex-1 flex flex-col">
          <EmptyState onAddTrack={onAddTrack} />
        </section>
        <TrackDetailPanel />
      </>
    );
  }

  return (
    <>
      <section className="flex-1 flex flex-col overflow-hidden">
        <header className="px-4 py-3 border-b border-border-subtle flex items-center gap-3">
          <button
            onClick={onAddTrack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent text-white font-medium text-sm hover:opacity-90"
          >
            <Plus size={14} />
            Add Track
          </button>
          <span className="text-text-tertiary text-sm ml-auto">
            {list.length} track{list.length === 1 ? "" : "s"}
          </span>
        </header>
        <div className="px-4 py-2 flex items-center gap-4 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary border-b border-border-subtle">
          <div className="flex-1">Title</div>
          <div className="w-16 text-right">BPM</div>
          <div className="w-20">Key</div>
          <div className="w-32">Genre</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              selected={current?.id === t.id}
              onSelect={() => select(t.id)}
              onOpen={() => navigate(`/tracks/${t.id}/edit`)}
            />
          ))}
        </div>
      </section>
      <TrackDetailPanel />
    </>
  );
}
