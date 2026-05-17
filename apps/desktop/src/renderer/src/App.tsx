import React, { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

import { AppShell } from "@/routes/AppShell";
import { TrackListPanel } from "@/routes/TrackListPanel";
import { TrackEditor } from "@/routes/TrackEditor";
import { SettingsPanel } from "@/routes/SettingsPanel";
import { WelcomeScreen } from "@/routes/WelcomeScreen";
import { TrashPanel } from "@/routes/TrashPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OutOfSourceDialog } from "@/components/OutOfSourceDialog";
import { SidecarCrashToast } from "@/components/SidecarCrashToast";
import { DragOverlayPreview } from "@/components/DragOverlayPreview";
import { useDialogStore } from "@/stores/dialogs";
import { useSourceStore } from "@/stores/sources";
import { useTrackStore } from "@/stores/tracks";
import { useListStore } from "@/stores/lists";
import { lists as listsApi } from "@/api/lists";

interface ActiveDrag {
  trackId: number;
  count: number;
  title?: string;
}

function GlobalDialogs(): React.JSX.Element | null {
  const req = useDialogStore((s) => s.outOfSource);
  const close = useDialogStore((s) => s.closeOutOfSource);
  if (!req) return null;

  // Shadow req to a local const so callbacks close over the non-null value.
  const currentReq = req;

  async function onCopy(args: { sourceId: number; subfolder: string }): Promise<void> {
    const src = currentReq.availableSources.find((s) => s.id === args.sourceId);
    if (!src) return;
    const newPath = await window.beatos.copyIntoSource(
      currentReq.filePath,
      src.root_path,
      args.subfolder || null,
    );
    currentReq.onResolved(newPath);
    close();
  }

  async function onMove(args: { sourceId: number; subfolder: string }): Promise<void> {
    const src = currentReq.availableSources.find((s) => s.id === args.sourceId);
    if (!src) return;
    const newPath = await window.beatos.moveIntoSource(
      currentReq.filePath,
      src.root_path,
      args.subfolder || null,
    );
    currentReq.onResolved(newPath);
    close();
  }

  async function onAddAsSource(): Promise<void> {
    const parent = currentReq.filePath.replace(/\/[^/]+$/, "");
    await useSourceStore.getState().add({ root_path: parent });
    currentReq.onResolved(currentReq.filePath);
    close();
  }

  return (
    <OutOfSourceDialog
      open
      filePath={req.filePath}
      availableSources={req.availableSources}
      onCancel={close}
      onCopy={onCopy}
      onMove={onMove}
      onAddAsSource={onAddAsSource}
    />
  );
}

export default function App(): React.JSX.Element {
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  // Distance-based activation. Drag only fires when listeners are mounted
  // on a dedicated drag handle (the cover thumbnail in TrackRow), so the
  // row body's clicks / double-clicks are unaffected.
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
          const overId = String(over.id);
          if (!overId.startsWith("list:")) return;
          const listId = Number(overId.slice("list:".length));
          const state = useTrackStore.getState();
          const sourceTrackId = Number(String(active.id).slice("track:".length));
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
          <GlobalDialogs />
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
