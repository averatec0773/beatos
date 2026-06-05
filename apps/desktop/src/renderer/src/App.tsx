import React, { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { AppShell } from "@/routes/AppShell";
import { TrackListPanel } from "@/routes/TrackListPanel";
import { TrackEditor } from "@/routes/TrackEditor";
import { SettingsPanel } from "@/routes/SettingsPanel";
import { TrashPanel } from "@/routes/TrashPanel";
import { ApprovalsPanel } from "@/routes/ApprovalsPanel";
import { PublishCenterPanel } from "@/routes/PublishCenterPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SidecarCrashToast } from "@/components/SidecarCrashToast";
import { DragOverlayPreview } from "@/components/DragOverlayPreview";
import { useTrackStore } from "@/stores/tracks";
import { useListStore } from "@/stores/lists";
import { addTracksToList } from "@/lib/add-tracks-to-list";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { useAppLanguageStore } from "@/stores/app-language";
import { usePlayerStore } from "@/stores/player";
import { useProStore } from "@/stores/pro";

interface ActiveDrag {
  trackId: number;
  count: number;
  title?: string;
}

export default function App(): React.JSX.Element {
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  // Load the persisted genre/mood display language once at boot. Failures
  // fall back to the store's "both" default (logged in the store).
  useEffect(() => {
    void useVocabLocaleStore.getState().hydrate();
    // Load the persisted App-UI language once at boot (defaults to English).
    void useAppLanguageStore.getState().hydrate();
    // Restore the persisted player resume point (last track, paused at its
    // saved position) + volume/mute/shuffle/repeat; falls back to idle if the
    // track or its file is gone.
    void usePlayerStore.getState().hydrate();
    // Probe the Pro engine once: the publish UI greys out unless the buyout
    // build answers /api/pro/status with {publish: true}.
    void useProStore.getState().loadProStatus();
  }, []);

  // Distance-based activation prevents click-to-select from triggering a drag.
  // Listeners are mounted on the whole row root in TrackRow, so a 5px move
  // is required before dnd-kit activates — row clicks/double-clicks are unaffected.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  return (
    <ErrorBoundary>
      <SidecarCrashToast />
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => {
          const id = String(active.id);
          if (!id.startsWith("track:")) return;
          const trackId = Number(id.slice("track:".length));
          const state = useTrackStore.getState();
          const selected = state.selectedIds;
          let count: number;
          let title: string | undefined;
          if (selected.has(trackId) && selected.size > 1) {
            count = selected.size;
            title = undefined;
          } else {
            if (!selected.has(trackId)) {
              state.selectOne(trackId, "replace");
            }
            count = 1;
            title = state.list.find((t) => t.id === trackId)?.title;
          }
          setActiveDrag({ trackId, count, title });
        }}
        onDragEnd={async ({ active, over }) => {
          setActiveDrag(null);
          if (!over?.id) return;
          const activeId = String(active.id);
          const overId = String(over.id);

          // List → list reorder. Each list row has TWO droppables: the outer
          // SortableContext (`list:N`) and an inner track-drop target
          // (`list-drop:N`). When dragging a list, dnd-kit's collision detection
          // usually picks the inner `list-drop:N`, so accept both ids here as
          // valid reorder targets.
          if (activeId.startsWith("list:")) {
            const targetId = overId.startsWith("list:")
              ? Number(overId.slice("list:".length))
              : overId.startsWith("list-drop:")
                ? Number(overId.slice("list-drop:".length))
                : null;
            const sourceId = Number(activeId.slice("list:".length));
            if (targetId == null || targetId === sourceId) return;
            const listStore = useListStore.getState();
            const userLists = listStore.all.filter((l) => l.kind !== "system");
            const oldIdx = userLists.findIndex((l) => l.id === sourceId);
            const newIdx = userLists.findIndex((l) => l.id === targetId);
            if (oldIdx < 0 || newIdx < 0) return;
            const reordered = arrayMove(userLists, oldIdx, newIdx);
            void listStore.reorder(reordered.map((l) => l.id));
            return;
          }

          if (!activeId.startsWith("track:")) return;
          const isListDrop = overId.startsWith("list-drop:");
          const isListSortable = overId.startsWith("list:");
          if (!isListDrop && !isListSortable) return;
          const listId = isListDrop
            ? Number(overId.slice("list-drop:".length))
            : Number(overId.slice("list:".length));
          const state = useTrackStore.getState();
          const sourceTrackId = Number(activeId.slice("track:".length));
          let trackIds = Array.from(state.selectedIds);
          if (trackIds.length === 0) trackIds = [sourceTrackId];

          await addTracksToList(listId, trackIds);
        }}
        onDragCancel={() => setActiveDrag(null)}
      >
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<TrackListPanel />} />
              <Route path="/tracks/:id/edit" element={<TrackEditor />} />
              <Route path="/lists/:id" element={<TrackListPanel />} />
              <Route path="/approvals" element={<ApprovalsPanel />} />
              <Route path="/settings" element={<SettingsPanel />} />
              <Route path="/trash" element={<TrashPanel />} />
              <Route path="/publish" element={<PublishCenterPanel />} />
            </Route>
          </Routes>
        </HashRouter>
        <DragOverlay>
          {activeDrag ? (
            <DragOverlayPreview count={activeDrag.count} title={activeDrag.title} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </ErrorBoundary>
  );
}
