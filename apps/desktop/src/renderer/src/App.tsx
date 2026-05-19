import React, { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { AppShell } from "@/routes/AppShell";
import { TrackListPanel } from "@/routes/TrackListPanel";
import { TrackEditor } from "@/routes/TrackEditor";
import { SettingsPanel } from "@/routes/SettingsPanel";
import { WelcomeScreen } from "@/routes/WelcomeScreen";
import { TrashPanel } from "@/routes/TrashPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SidecarCrashToast } from "@/components/SidecarCrashToast";
import { DragOverlayPreview } from "@/components/DragOverlayPreview";
import { useSourceStore } from "@/stores/sources";
import { useTrackStore } from "@/stores/tracks";
import { useListStore } from "@/stores/lists";
import { lists as listsApi } from "@/api/lists";

interface ActiveDrag {
  trackId: number;
  count: number;
  title?: string;
}

export default function App(): React.JSX.Element {
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

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

          if (activeId.startsWith("source:") && overId.startsWith("source:") && activeId !== overId) {
            const srcStore = useSourceStore.getState();
            const all = srcStore.all;
            const oldIdx = all.findIndex((s) => `source:${s.id}` === activeId);
            const newIdx = all.findIndex((s) => `source:${s.id}` === overId);
            if (oldIdx < 0 || newIdx < 0) return;
            const reordered = arrayMove(all, oldIdx, newIdx);
            void srcStore.reorder(reordered.map((s) => s.id));
            return;
          }

          if (activeId.startsWith("list:") && overId.startsWith("list:") && activeId !== overId) {
            const listStore = useListStore.getState();
            const userLists = listStore.all.filter((l) => l.kind !== "system");
            const oldIdx = userLists.findIndex((l) => `list:${l.id}` === activeId);
            const newIdx = userLists.findIndex((l) => `list:${l.id}` === overId);
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

          const results = await Promise.allSettled(
            trackIds.map((tid) => listsApi.addTrack(listId, tid))
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) {
            console.warn(`[dnd] ${failed}/${trackIds.length} adds failed to list ${listId}`);
          }
          await useListStore.getState().refresh();
        }}
        onDragCancel={() => setActiveDrag(null)}
      >
        <HashRouter>
          <Routes>
            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<TrackListPanel />} />
              <Route path="/tracks/:id/edit" element={<TrackEditor />} />
              <Route path="/lists/:id" element={<TrackListPanel />} />
              <Route path="/settings" element={<SettingsPanel />} />
              <Route path="/trash" element={<TrashPanel />} />
            </Route>
          </Routes>
        </HashRouter>
        <DragOverlay>
          {activeDrag ? <DragOverlayPreview count={activeDrag.count} title={activeDrag.title} /> : null}
        </DragOverlay>
      </DndContext>
    </ErrorBoundary>
  );
}
