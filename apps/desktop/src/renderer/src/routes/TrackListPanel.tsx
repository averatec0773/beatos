import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { attachAudioToTrack, importAsNewTracks } from "@/lib/create-track-from-file";

import { useTrackStore } from "@/stores/tracks";
import { useTrackQueryStore } from "@/stores/track-query";
import { useListStore } from "@/stores/lists";
import { useToastStore } from "@/stores/toast";
import { TrackRow } from "@/components/TrackRow";
import { EmptyState } from "@/components/EmptyState";
import { TrackDetailPanel } from "@/routes/TrackDetailPanel";
import { TrackContextMenu } from "@/components/TrackContextMenu";
import { VirtualTrackList } from "@/components/VirtualTrackList";
import { TableHeader } from "@/components/TableHeader";
import { FilterChipBar } from "@/components/FilterChipBar";
import { ImportAudioDialog } from "@/components/ImportAudioDialog";
import { BulkActionBar, type BulkAction } from "@/components/BulkActionBar";
import { AddToListPopover } from "@/components/AddToListPopover";
import { tracks as tracksApi } from "@/api/tracks";

export function TrackListPanel(): React.JSX.Element {
  const list = useTrackStore((s) => s.list);
  const current = useTrackStore((s) => s.current);
  const refresh = useTrackStore((s) => s.refresh);
  const select = useTrackStore((s) => s.select);
  const selectedIds = useTrackStore((s) => s.selectedIds);
  const selectOne = useTrackStore((s) => s.selectOne);
  const selectAll = useTrackStore((s) => s.selectAll);
  const clearSelection = useTrackStore((s) => s.clearSelection);
  const remove = useTrackStore((s) => s.remove);
  const createTrack = useTrackStore((s) => s.create);
  const searchQuery = useTrackQueryStore((s) => s.q);
  const allLists = useListStore((s) => s.all);
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Determine filter source: if route is /lists/:id, filter to that list's tracks
  const listId = params.id ? Number(params.id) : null;
  const currentList = listId ? allLists.find((l) => l.id === listId) : null;

  useEffect(() => {
    refresh(listId != null ? { list_id: listId } : undefined);
  }, [refresh, listId]);

  // Defensive: if the underlying list goes empty (e.g. all selected tracks
  // were trashed via MCP, or the user emptied a list) while a multi-select
  // is in flight, drop the selection so the BulkActionBar can't reappear
  // with stale IDs when content returns.
  useEffect(() => {
    if (list.length === 0 && selectedIds.size > 0) clearSelection();
  }, [list.length, selectedIds.size, clearSelection]);

  // Cmd/Ctrl+A → select all visible rows; Esc → clear selection.
  // Skip when the user is typing in a text field (search box, inputs in
  // dialogs / TrackEditor, contenteditable nodes), otherwise we'd hijack
  // browser-native select-all in those fields.
  useEffect(() => {
    function isTextTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (isTextTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === "Escape") {
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectAll, clearSelection]);

  const visible = list;

  // Auto-select first row on mount when nothing is selected and list is non-empty
  useEffect(() => {
    if (visible.length > 0 && current == null) {
      select(visible[0].id);
    }
  }, [visible.length, current, select, visible]);

  const [dropping, setDropping] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const importDialogOpen = importFiles.length > 0;

  // Single source of X-scroll: the body. The header sits in its own div with
  // an *invisible* native X-scroll (so `scrollLeft` is programmable) and we
  // mirror the body's scrollLeft into it on every body-scroll event. Without
  // this, the previous "shared wrapper has overflow-x-auto AND the body's
  // own overflow-y promotes overflow-x to auto" arrangement created two
  // independent X-scroll containers, and dragging in the body area shifted
  // only the body while the header stayed put.
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  // `useCallback` keeps the prop reference stable across renders. Without it,
  // VirtualTrackList's effect would re-subscribe to the scroll event on
  // every parent render — a brief teardown window per render where a stray
  // scroll could fire without a listener.
  const syncHeaderScroll = useCallback((scrollLeft: number): void => {
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollLeft;
  }, []);

  // Reverse sync: user wheeling horizontally on the header (e.g. trackpad
  // swipe) shouldn't desync the body. `syncing` is cleared synchronously
  // right after the assignment — the re-entrant `scroll` event fires
  // synchronously in browsers, so clearing immediately is sufficient and
  // doesn't drop legitimate user scrolls that happen during the next frame.
  useEffect(() => {
    const header = headerScrollRef.current;
    if (!header) return;
    let syncing = false;
    const onHeaderScroll = (): void => {
      if (syncing) return;
      const body = bodyScrollRef.current;
      if (!body) return;
      if (body.scrollLeft === header.scrollLeft) return;
      syncing = true;
      body.scrollLeft = header.scrollLeft;
      syncing = false;
    };
    header.addEventListener("scroll", onHeaderScroll, { passive: true });
    return () => header.removeEventListener("scroll", onHeaderScroll);
  }, []);

  function onSectionDrop(e: React.DragEvent<HTMLElement>): void {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return ext === ".wav" || ext === ".mp3";
    });
    if (files.length === 0) return;
    setImportFiles(files);
  }

  async function runImport(opts: {
    destination: "new" | "attach";
    tag: "tagged" | "untagged";
  }): Promise<void> {
    const files = importFiles;
    setImportFiles([]);
    const toast = useToastStore.getState();
    if (opts.destination === "attach" && current) {
      const r = await attachAudioToTrack(files, current.id, opts.tag);
      if (r.errors.length > 0) {
        toast.show("error", `Attach failed: ${r.errors.join("; ")}`, 6000);
      } else {
        toast.show("success", `Attached ${opts.tag} audio to "${current.title}"`);
      }
      return;
    }
    const r = await importAsNewTracks(files, opts.tag);
    if (r.errors.length > 0) {
      toast.show(
        "warning",
        `Imported ${r.created}/${files.length} — ${r.errors.length} failed`,
        6000,
      );
      console.warn("[import] errors:", r.errors);
    } else if (r.created > 0) {
      toast.show(
        "success",
        r.created === 1
          ? `Imported 1 track (${opts.tag})`
          : `Imported ${r.created} tracks (${opts.tag})`,
      );
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

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        key: "add",
        label: "Add to list",
        onClick: () => {},
        render: () => (
          <AddToListPopover
            trackIds={Array.from(selectedIds)}
            excludeListId={listId}
            onDone={clearSelection}
          />
        ),
      },
      {
        key: "trash",
        label: "Move to trash",
        variant: "danger",
        icon: <Trash2 size={14} />,
        onClick: async () => {
          const ids = Array.from(selectedIds);
          if (
            !confirm(
              ids.length === 1 ? "Move 1 track to trash?" : `Move ${ids.length} tracks to trash?`,
            )
          )
            return;
          for (const id of ids) {
            try {
              await tracksApi.remove(id);
            } catch (e) {
              console.warn("[bulk-trash] failed for", id, e);
            }
          }
          clearSelection();
          await refresh(listId != null ? { list_id: listId } : undefined);
          void useTrackStore.getState().refreshTotal();
          useToastStore
            .getState()
            .show(
              "success",
              ids.length === 1 ? "Moved 1 track to trash" : `Moved ${ids.length} tracks to trash`,
            );
        },
      },
    ],
    [selectedIds, listId, refresh, clearSelection],
  );

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
          onClear={() => useTrackQueryStore.getState().setText("")}
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
        <ImportAudioDialog
          open={importDialogOpen}
          files={importFiles}
          attachCandidate={current ? { id: current.id, title: current.title } : null}
          onCancel={() => setImportFiles([])}
          onConfirm={(opts) => void runImport(opts)}
        />
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
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header wrapper: invisible native X-scroll so we can mirror the
              body's scrollLeft into it via JS. `beatos-scroll` hides the
              scrollbar UI. */}
          <div
            ref={headerScrollRef}
            className="flex-shrink-0 beatos-scroll"
            style={{ overflowX: "auto", overflowY: "hidden" }}
          >
            <TableHeader />
          </div>
          <VirtualTrackList
            tracks={visible}
            onScrollLeftChange={syncHeaderScroll}
            scrollRef={bodyScrollRef}
            renderRow={(t) => (
              <TrackContextMenu
                key={t.id}
                trackId={t.id}
                trackTitle={t.title}
                audioPath={null}
                currentListId={listId}
                onEdit={() => navigate(`/tracks/${t.id}/edit`)}
                onDelete={() => remove(t.id)}
                onRemoveFromList={() => refresh(listId != null ? { list_id: listId } : undefined)}
              >
                <div className="data-[state=open]:ring-2 data-[state=open]:ring-inset data-[state=open]:ring-accent">
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
          <BulkActionBar count={selectedIds.size} onClear={clearSelection} actions={bulkActions} />
        </div>
      </section>
      <TrackDetailPanel />
      <ImportAudioDialog
        open={importDialogOpen}
        files={importFiles}
        attachCandidate={current ? { id: current.id, title: current.title } : null}
        onCancel={() => setImportFiles([])}
        onConfirm={(opts) => void runImport(opts)}
      />
    </>
  );
}
