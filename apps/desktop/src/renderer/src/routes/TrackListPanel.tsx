import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { createTracksFromFiles } from "@/lib/create-track-from-file";

import { useTrackStore } from "@/stores/tracks";
import { useSearchStore } from "@/stores/search";
import { useListStore } from "@/stores/lists";
import { TrackRow } from "@/components/TrackRow";
import { EmptyState } from "@/components/EmptyState";
import { TrackDetailPanel } from "@/routes/TrackDetailPanel";
import { TrackContextMenu } from "@/components/TrackContextMenu";
import { VirtualTrackList } from "@/components/VirtualTrackList";
import { TableHeader } from "@/components/TableHeader";
import { FilterChipBar } from "@/components/FilterChipBar";

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

  const [dropping, setDropping] = useState(false);

  async function onSectionDrop(e: React.DragEvent<HTMLElement>): Promise<void> {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const result = await createTracksFromFiles(files);
    if (result.errors.length > 0) {
      alert(`Issues:\n${result.errors.join("\n")}`);
    }
    if (result.created > 0 || result.skipped > 0) {
      console.info(`[drop-create] created ${result.created}, skipped ${result.skipped}`);
    }
  }

  function onSectionDragOver(e: React.DragEvent<HTMLElement>): void {
    // Always preventDefault — gating on types.includes("Files") was unreliable (v0.0.13.2 lesson)
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dropping) setDropping(true);
  }

  function onSectionDragLeave(e: React.DragEvent<HTMLElement>): void {
    // Use relatedTarget check to avoid flicker from child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
  }

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
        <section
          className="flex-1 flex flex-col relative"
          onDragOver={onSectionDragOver}
          onDragLeave={onSectionDragLeave}
          onDrop={onSectionDrop}
          data-library-drop-target
        >
          {dropping && (
            <div
              data-drop-overlay
              className="absolute inset-0 z-50 bg-accent/10 border-2 border-accent border-dashed pointer-events-none flex items-center justify-center"
            >
              <span className="text-accent text-base font-medium">
                Drop audio files (.wav or .mp3) to create new tracks
              </span>
            </div>
          )}
          {emptyEl}
        </section>
        <TrackDetailPanel />
      </>
    );
  }

  return (
    <>
      <section
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={onSectionDragOver}
        onDragLeave={onSectionDragLeave}
        onDrop={onSectionDrop}
        data-library-drop-target
      >
        {dropping && (
          <div
            data-drop-overlay
            className="absolute inset-0 z-50 bg-accent/10 border-2 border-accent border-dashed pointer-events-none flex items-center justify-center"
          >
            <span className="text-accent text-base font-medium">
              Drop audio files (.wav or .mp3) to create new tracks
            </span>
          </div>
        )}
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
        <FilterChipBar />
        {/* Shared horizontal scroll wrapper so TableHeader and the virtualized
            rows scroll together when columns are widened beyond the section.
            `min-w-0` lets it shrink inside the flex parent; the inner pieces
            set `min-w: min-content` so they grow only when the user actually
            pins a column wider than the viewport. */}
        <div className="flex-1 flex flex-col overflow-x-auto min-w-0">
          <TableHeader />
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
        </div>
      </section>
      <TrackDetailPanel />
    </>
  );
}
