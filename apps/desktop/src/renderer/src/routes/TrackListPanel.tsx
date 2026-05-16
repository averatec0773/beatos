import React, { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useTrackStore } from "@/stores/tracks";
import { useSearchStore } from "@/stores/search";
import { useListStore } from "@/stores/lists";
import { TrackRow } from "@/components/TrackRow";
import { EmptyState } from "@/components/EmptyState";
import { TrackDetailPanel } from "@/routes/TrackDetailPanel";
import { TrackContextMenu } from "@/components/TrackContextMenu";
import { VirtualTrackList } from "@/components/VirtualTrackList";

export function TrackListPanel(): React.JSX.Element {
  const list = useTrackStore((s) => s.list);
  const current = useTrackStore((s) => s.current);
  const refresh = useTrackStore((s) => s.refresh);
  const select = useTrackStore((s) => s.select);
  const selectedIds = useTrackStore((s) => s.selectedIds);
  const selectOne = useTrackStore((s) => s.selectOne);
  const remove = useTrackStore((s) => s.remove);
  const createTrack = useTrackStore((s) => s.create);
  const filterFn = useSearchStore((s) => s.filter);
  const searchQuery = useSearchStore((s) => s.query);
  const allLists = useListStore((s) => s.all);
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Determine filter source: if route is /lists/:id, filter to that list's tracks
  const listId = params.id ? Number(params.id) : null;
  const currentList = listId ? allLists.find((l) => l.id === listId) : null;

  useEffect(() => {
    refresh(listId != null ? { list_id: listId } : undefined);
  }, [refresh, listId]);

  const visible = useMemo(() => filterFn(list), [list, filterFn]);

  // Auto-select first row on mount when nothing is selected and list is non-empty
  useEffect(() => {
    if (visible.length > 0 && current == null) {
      select(visible[0].id);
    }
  }, [visible.length, current, select, visible]);

  async function onAddTrack(): Promise<void> {
    // Eager creation: POST the row immediately so the editor has a real
    // track id to attach assets against. ESC/Cancel leaves an 'Untitled'
    // row, which the user can clean up via right-click → Delete.
    const t = await createTrack("Untitled");
    navigate(`/tracks/${t.id}/edit`);
  }

  if (list.length === 0) {
    let emptyEl: React.ReactNode;
    if (currentList) {
      emptyEl = <EmptyState variant="empty-list" listName={currentList.name} />;
    } else if (searchQuery) {
      emptyEl = (
        <EmptyState
          variant="no-search-results"
          query={searchQuery}
          onClear={() => useSearchStore.getState().setQuery("")}
        />
      );
    } else {
      emptyEl = <EmptyState variant="no-tracks" onAddTrack={onAddTrack} />;
    }
    return (
      <>
        <section className="flex-1 flex flex-col">{emptyEl}</section>
        <TrackDetailPanel />
      </>
    );
  }

  return (
    <>
      <section className="flex-1 flex flex-col overflow-hidden">
        <header className="px-4 py-3 border-b border-border-subtle flex items-center gap-3">
          <button
            type="button"
            onClick={onAddTrack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent text-white font-medium text-sm hover:opacity-90"
          >
            <Plus size={14} />
            Add Track
          </button>
          <span className="text-text-tertiary text-sm ml-auto">
            {currentList ? `${currentList.name} · ` : ""}
            {visible.length} track{visible.length === 1 ? "" : "s"}
          </span>
        </header>
        <div className="px-4 py-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary border-b border-border-subtle">
          <div className="w-10" /> {/* cover thumb column */}
          <div className="flex-1">Title</div>
          <div className="w-16 text-right">BPM</div>
          <div className="w-20">Key</div>
          <div className="w-32">Genre</div>
          <div className="w-7" /> {/* delete hover column */}
        </div>
        <VirtualTrackList
          tracks={visible}
          renderRow={(t) => (
            <TrackContextMenu
              key={t.id}
              trackId={t.id}
              trackTitle={t.title}
              audioPath={null}
              currentListId={listId}
              onEdit={() => navigate(`/tracks/${t.id}/edit`)}
              onDelete={() => remove(t.id)}
              onRemoveFromList={() =>
                refresh(listId != null ? { list_id: listId } : undefined)
              }
            >
              <div>
                <TrackRow
                  track={t}
                  coverAssetId={t.cover_asset_id}
                  selected={current?.id === t.id}
                  isMultiSelected={selectedIds.has(t.id)}
                  onSelect={(e: React.MouseEvent) => {
                    if (e.shiftKey) {
                      selectOne(t.id, "range");
                    } else if (e.metaKey || e.ctrlKey) {
                      selectOne(t.id, "toggle");
                    } else {
                      selectOne(t.id, "replace");
                      select(t.id);
                    }
                  }}
                  onOpen={() => navigate(`/tracks/${t.id}/edit`)}
                  onDelete={() => {
                    if (confirm(`Delete "${t.title}"?`)) remove(t.id);
                  }}
                />
              </div>
            </TrackContextMenu>
          )}
        />
      </section>
      <TrackDetailPanel />
    </>
  );
}
