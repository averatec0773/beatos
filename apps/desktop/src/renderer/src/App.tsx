import React, { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DndContext, DragOverlay } from "@dnd-kit/core";

import { AppShell } from "@/routes/AppShell";
import { TrackListPanel } from "@/routes/TrackListPanel";
import { TrackEditor } from "@/routes/TrackEditor";
import { SettingsPanel } from "@/routes/SettingsPanel";
import { WelcomeScreen } from "@/routes/WelcomeScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OutOfSourceDialog } from "@/components/OutOfSourceDialog";
import { SidecarCrashToast } from "@/components/SidecarCrashToast";
import { DragOverlayPreview } from "@/components/DragOverlayPreview";
import { useDialogStore } from "@/stores/dialogs";
import { useSourceStore } from "@/stores/sources";

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

  return (
    <ErrorBoundary>
      <SidecarCrashToast />
      <DndContext
        onDragStart={({ active }) => {
          const id = String(active.id);
          if (!id.startsWith("track:")) return;
          const trackId = Number(id.slice("track:".length));
          setActiveDrag({ trackId, count: 1 });
        }}
        onDragEnd={() => setActiveDrag(null)}
        onDragCancel={() => setActiveDrag(null)}
      >
        <BrowserRouter>
          <GlobalDialogs />
          <Routes>
            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<TrackListPanel />} />
              <Route path="/tracks/:id/edit" element={<TrackEditor />} />
              <Route path="/lists/:id" element={<TrackListPanel />} />
              <Route path="/settings" element={<SettingsPanel />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <DragOverlay>
          {activeDrag ? <DragOverlayPreview count={activeDrag.count} title={activeDrag.title} /> : null}
        </DragOverlay>
      </DndContext>
    </ErrorBoundary>
  );
}
