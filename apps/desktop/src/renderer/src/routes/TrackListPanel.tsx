import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Package, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { attachAudioToTrack, importAsNewTracks } from "@/lib/create-track-from-file";
import { trashTracksWithUndo } from "@/lib/trash-actions";
import { platform } from "@/platform";

import { useTrackStore } from "@/stores/tracks";
import { useTrackQueryStore } from "@/stores/track-query";
import { useListStore } from "@/stores/lists";
import { useToastStore } from "@/stores/toast";
import { TrackRow } from "@/components/TrackRow";
import { EmptyState } from "@/components/EmptyState";
import { TrackDetailPanel, PreviewGutter } from "@/routes/TrackDetailPanel";
import { PlaylistHero } from "@/components/PlaylistHero";
import { usePreviewPanelStore } from "@/stores/preview-panel";
import { TrackContextMenu } from "@/components/TrackContextMenu";
import { VirtualTrackList } from "@/components/VirtualTrackList";
import { TableHeader } from "@/components/TableHeader";
import { FilterChipBar } from "@/components/FilterChipBar";
import { ImportAudioDialog } from "@/components/ImportAudioDialog";
import { BulkActionBar, type BulkAction } from "@/components/BulkActionBar";
import { AddToListPopover } from "@/components/AddToListPopover";
import { BulkEditDialog } from "@/components/BulkEditDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { PlaylistExportDialog } from "@/components/PlaylistExportDialog";
import { analysis } from "@/api/analysis";
import { useAnalysisJobStore } from "@/stores/analysis-job";

export function TrackListPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const list = useTrackStore((s) => s.list);
  const loading = useTrackStore((s) => s.loading);
  const error = useTrackStore((s) => s.error);
  const current = useTrackStore((s) => s.current);
  const refresh = useTrackStore((s) => s.refresh);
  const select = useTrackStore((s) => s.select);
  const selectedIds = useTrackStore((s) => s.selectedIds);
  const selectOne = useTrackStore((s) => s.selectOne);
  const selectAll = useTrackStore((s) => s.selectAll);
  const clearSelection = useTrackStore((s) => s.clearSelection);
  const createTrack = useTrackStore((s) => s.create);
  const setActiveListId = useTrackStore((s) => s.setActiveListId);
  const searchQuery = useTrackQueryStore((s) => s.q);
  const allLists = useListStore((s) => s.all);
  const membershipVersion = useListStore((s) => s.membershipVersion);
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Determine filter source: if route is /lists/:id, filter to that list's tracks
  const listId = params.id ? Number(params.id) : null;
  const currentList = listId ? allLists.find((l) => l.id === listId) : null;

  // `membershipVersion` is a dep so adding a track to the list you're viewing
  // (0→1, listId unchanged) re-fetches and the hero/table/cover update at once.
  useEffect(() => {
    // Record the scope first so the query subscription's refresh() inherits it.
    setActiveListId(listId);
    refresh(listId != null ? { list_id: listId } : undefined);
  }, [refresh, setActiveListId, listId, membershipVersion]);

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

  // Auto-select the first row ONCE on initial load (so the preview panel isn't
  // empty on first open). A one-shot ref guard is what lets a later deselect
  // (clicking the empty list background) actually clear the highlight instead
  // of immediately bouncing back to row 1 the moment `current` goes null.
  const didAutoSelect = useRef(false);
  // Re-arm the one-shot when the view changes (route stays mounted across
  // /lists/:id ↔ / — rule 6). If `refresh` dropped `current` (it wasn't a member
  // of the new list), this lets the first row of the new view auto-focus instead
  // of leaving the panel empty.
  useEffect(() => {
    didAutoSelect.current = false;
  }, [listId]);
  useEffect(() => {
    if (!didAutoSelect.current && visible.length > 0 && current == null) {
      didAutoSelect.current = true;
      select(visible[0].id);
    }
  }, [visible, current, select]);

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [playlistExportOpen, setPlaylistExportOpen] = useState(false);
  // One ExportDialog for the whole list, opened by any row's context menu — was
  // one mounted dialog per visible row.
  const [exportTrackId, setExportTrackId] = useState<number | null>(null);
  const [unanalyzed, setUnanalyzed] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const importDialogOpen = importFiles.length > 0;

  const analysisJobId = useAnalysisJobStore((s) => s.jobId);
  useEffect(() => {
    if (listId != null) return;
    analysis
      .unanalyzedCount()
      .then((r) => setUnanalyzed(r.count))
      .catch(() => {});
  }, [listId, analysisJobId]);

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
    // Browsers can't expose a dropped OS file's absolute path (linked-mode needs
    // it). In the web build, importing is done via the file browser ("+ Add file");
    // a drop here is a no-op rather than a confusing "empty path" error.
    if (platform.kind !== "electron") return;
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
        toast.show(
          "error",
          t("dialogs.import.attachFailed", { errors: r.errors.join("; ") }),
          6000,
        );
      } else {
        toast.show(
          "success",
          t("dialogs.import.attached", { tag: opts.tag, title: current.title }),
        );
      }
      return;
    }
    const r = await importAsNewTracks(files, opts.tag);
    if (r.errors.length > 0) {
      toast.show(
        "warning",
        t("dialogs.import.partial", {
          created: r.created,
          total: files.length,
          failed: r.errors.length,
        }),
        6000,
      );
      console.warn("[import] errors:", r.errors);
    } else if (r.created > 0) {
      toast.show("success", t("dialogs.import.imported", { count: r.created, tag: opts.tag }));
    }
  }

  function onSectionDragOver(e: React.DragEvent<HTMLElement>): void {
    // Always preventDefault — gating on types.includes("Files") was unreliable (v0.0.13.2 lesson)
    e.preventDefault();
    if (platform.kind !== "electron") {
      e.dataTransfer.dropEffect = "none"; // OS-file drop-in is desktop-only (no path in the browser)
      return;
    }
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
        key: "edit-meta",
        label: t("trackList.editMetadata"),
        onClick: () => setBulkEditOpen(true),
      },
      {
        key: "analyze",
        label: t("trackList.analyzeSelected"),
        onClick: async () => {
          const ids = Array.from(selectedIds);
          const { job_id, total } = await analysis.startBatch("selected", ids);
          useAnalysisJobStore.getState().start(job_id, total);
          clearSelection();
        },
      },
      {
        key: "trash",
        label: t("trackList.moveToTrash"),
        variant: "danger",
        icon: <Trash2 size={14} />,
        onClick: async () => {
          const ids = Array.from(selectedIds);
          if (
            !confirm(
              ids.length === 1
                ? t("trackList.moveToTrashConfirm")
                : t("trackList.moveToTrashConfirmMany", { count: ids.length }),
            )
          )
            return;
          clearSelection();
          // Trashes, refreshes, and shows a toast with an Undo action that
          // restores exactly the rows that were trashed.
          await trashTracksWithUndo(ids, t);
        },
      },
    ],
    [selectedIds, listId, clearSelection, t],
  );

  async function onAddTrack(): Promise<void> {
    // Eager creation: POST the row immediately so the editor has a real track
    // id to attach assets against. The `isNew` flag lets the editor auto-discard
    // the row on exit if the user never touched it (nothing typed, no audio) —
    // so a misclick or quick back-out doesn't leave a junk 'Untitled' track.
    const t = await createTrack("Untitled");
    navigate(`/tracks/${t.id}/edit`, { state: { isNew: true } });
  }

  if (list.length === 0) {
    let emptyEl: React.ReactNode;
    if (error) {
      // Backend unreachable / fetch failed — be honest instead of showing the
      // "no tracks yet" empty state (which reads as "your library is empty").
      emptyEl = (
        <div className="max-w-md px-6 text-center space-y-3">
          <AlertCircle size={40} className="text-danger mx-auto" />
          <h2 className="text-lg font-semibold text-text-primary">
            {t("errors.backendUnreachable")}
          </h2>
          <p className="text-text-secondary text-sm">{t("errors.backendUnreachableDesc")}</p>
          <button
            onClick={() => void refresh(listId != null ? { list_id: listId } : undefined)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium btn-primary"
          >
            <RotateCcw size={14} /> {t("errors.retry")}
          </button>
        </div>
      );
    } else if (loading) {
      emptyEl = <div className="text-text-tertiary text-sm">{t("trackList.loading")}</div>;
    } else if (currentList) {
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
          className="flex-1 flex flex-col relative rounded-xl beatos-card overflow-hidden"
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
              <span className="text-accent text-base font-medium">{t("trackList.dropAudio")}</span>
            </div>
          )}
          {/* An empty *list* still shows its hero (mosaic + name) — only the
              track area below reads as empty. Other empty states (no tracks at
              all, no search results) fill the whole card. */}
          {currentList && (
            <PlaylistHero name={currentList.name} tracks={[]} listId={currentList.id} />
          )}
          <div className="flex-1 flex items-center justify-center">{emptyEl}</div>
        </section>
        <PreviewGutter />
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
        className="flex-1 flex flex-col overflow-hidden relative rounded-xl beatos-card"
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
            <span className="text-accent text-base font-medium">{t("trackList.dropAudio")}</span>
          </div>
        )}
        {currentList && (
          <PlaylistHero name={currentList.name} tracks={visible} listId={currentList.id} />
        )}
        <header className="px-4 py-2.5 border-b border-border-subtle flex items-center gap-3">
          <button
            type="button"
            onClick={onAddTrack}
            className="btn-primary inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
          >
            <Plus size={13} />
            {t("trackList.addTrack")}
          </button>
          {listId == null && unanalyzed > 0 && (
            <button
              type="button"
              onClick={async () => {
                const { job_id, total } = await analysis.startBatch("unanalyzed");
                useAnalysisJobStore.getState().start(job_id, total);
              }}
              className="rounded-md border border-border-subtle px-2 py-1 text-xs hover:bg-bg-row-hover"
            >
              {t("trackList.analyzeAll", { count: unanalyzed })}
            </button>
          )}
          {currentList && (
            <button
              type="button"
              data-export-playlist
              onClick={() => setPlaylistExportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-xs hover:bg-bg-row-hover"
              title={t("trackList.exportPlaylistTitle")}
            >
              <Package size={13} />
              {t("trackList.exportPlaylist")}
            </button>
          )}
          <div className="h-4 w-px bg-border-subtle" />
          <FilterChipBar inline />
          <span className="text-text-tertiary text-sm ml-auto whitespace-nowrap">
            {currentList ? `${currentList.name} · ` : ""}
            {t("trackList.trackCount", { count: visible.length })}
          </span>
        </header>
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
            onBackgroundClick={() => {
              clearSelection();
              select(null);
            }}
            renderRow={(track) => (
              <TrackContextMenu
                key={track.id}
                trackId={track.id}
                trackTitle={track.title}
                audioPath={null}
                currentListId={listId}
                onEdit={() => navigate(`/tracks/${track.id}/edit`)}
                onDelete={() => void trashTracksWithUndo([track.id], t)}
                onExport={() => setExportTrackId(track.id)}
                onRemoveFromList={() => refresh(listId != null ? { list_id: listId } : undefined)}
              >
                <div className="data-[state=open]:ring-2 data-[state=open]:ring-inset data-[state=open]:ring-accent">
                  <TrackRow
                    track={track}
                    coverAssetId={track.cover_asset_id}
                    selected={current?.id === track.id}
                    isMultiSelected={selectedIds.has(track.id)}
                    onSelect={(e: React.MouseEvent) => {
                      if (e.shiftKey) {
                        selectOne(track.id, "range");
                      } else if (e.metaKey || e.ctrlKey) {
                        selectOne(track.id, "toggle");
                      } else {
                        selectOne(track.id, "replace");
                        select(track.id);
                        // Reopen the detail panel on a plain click — it's the
                        // reopen path now that the TopBar toggle is gone.
                        usePreviewPanelStore.getState().setOpen(true);
                      }
                    }}
                    onOpen={() => navigate(`/tracks/${track.id}/edit`)}
                    onDelete={() => void trashTracksWithUndo([track.id], t)}
                  />
                </div>
              </TrackContextMenu>
            )}
          />
          <BulkActionBar count={selectedIds.size} onClear={clearSelection} actions={bulkActions} />
          <BulkEditDialog
            open={bulkEditOpen}
            ids={Array.from(selectedIds)}
            onClose={() => setBulkEditOpen(false)}
            onDone={() => {
              setBulkEditOpen(false);
              clearSelection();
            }}
          />
          <ExportDialog
            open={exportTrackId != null}
            trackId={exportTrackId ?? 0}
            onClose={() => setExportTrackId(null)}
          />
          {currentList && (
            <PlaylistExportDialog
              open={playlistExportOpen}
              listId={currentList.id}
              listName={currentList.name}
              onClose={() => setPlaylistExportOpen(false)}
            />
          )}
        </div>
      </section>
      <PreviewGutter />
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
