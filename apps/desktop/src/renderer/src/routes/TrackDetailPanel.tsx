import React, { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";

import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { CoverImage } from "@/components/CoverImage";
import {
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
  usePreviewPanelStore,
} from "@/stores/preview-panel";

function PreviewResizer(): React.JSX.Element {
  const setWidth = usePreviewPanelStore((s) => s.setWidth);
  const startRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    startRef.current = {
      startX: e.clientX,
      startWidth: usePreviewPanelStore.getState().width,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const s = startRef.current;
    if (!s) return;
    // Drag LEFT = wider (panel grows from its left edge), so subtract delta.
    const next = s.startWidth - (e.clientX - s.startX);
    setWidth(Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, next)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!startRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    startRef.current = null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize preview panel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-accent/40 z-10"
      data-preview-resizer
    />
  );
}

function CloseButton(): React.JSX.Element {
  const setOpen = usePreviewPanelStore((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="absolute top-3 right-3 z-10 text-text-tertiary hover:text-text-primary p-1 rounded-md hover:bg-bg-row-hover"
      aria-label="Close preview"
      data-preview-close
    >
      <X size={14} />
    </button>
  );
}

export function TrackDetailPanel(): React.JSX.Element | null {
  const open = usePreviewPanelStore((s) => s.open);
  const width = usePreviewPanelStore((s) => s.width);
  const current = useTrackStore((s) => s.current);
  const byTrack = useAssetStore((s) => s.byTrack);

  // Selecting a track while the panel is closed shouldn't silently open it —
  // user explicitly closed it. They re-open via the TopBar toggle.
  // (Spotify behavior; less surprising than auto-reopen.)

  const coverAsset = useMemo(() => {
    if (!current) return null;
    const list = byTrack[current.id];
    if (!list) return null;
    return list.find((a) => a.role === "cover") ?? null;
  }, [byTrack, current]);

  useEffect(() => {
    // No-op; keeps lint happy when the panel is mounted-but-hidden mode is
    // considered in the future.
  }, []);

  if (!open) return null;

  if (!current) {
    return (
      <aside
        className="relative beatos-scroll bg-bg-elevated border-l border-border-subtle p-4 flex-shrink-0"
        style={{ width }}
      >
        <PreviewResizer />
        <CloseButton />
        <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          Now Focused
        </div>
        <div className="mt-2 text-text-tertiary text-sm">Select a track to see details.</div>
      </aside>
    );
  }

  return (
    <aside
      className="relative beatos-scroll bg-bg-elevated border-l border-border-subtle p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0"
      style={{ width }}
    >
      <PreviewResizer />
      <CloseButton />
      <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        Now Focused
      </div>
      <div
        draggable={coverAsset != null && !coverAsset.missing}
        onDragStart={(e) => {
          if (!coverAsset || coverAsset.missing) return;
          e.preventDefault();
          window.beatos.startDragFile(coverAsset.abs_path);
        }}
        data-cover-drag-source
        className="w-full"
      >
        <CoverImage assetId={coverAsset?.id ?? null} size={320} responsive />
      </div>
      <div>
        <div className="text-2xl font-bold leading-tight">{current.title}</div>
        <div className="text-text-secondary text-sm mt-1">
          {current.genre && current.genre.length > 0
            ? current.genre.join(", ")
            : <span className="text-text-tertiary">No genre</span>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-text-tertiary">BPM</dt>
        <dd className="font-mono">{current.bpm ?? "—"}</dd>
        <dt className="text-text-tertiary">Key</dt>
        <dd>{current.key_signature ?? "—"}</dd>
        <dt className="text-text-tertiary">Mood</dt>
        <dd>{current.mood && current.mood.length > 0 ? current.mood.join(", ") : "—"}</dd>
        <dt className="text-text-tertiary">License</dt>
        <dd>{current.license_type}</dd>
        <dt className="text-text-tertiary">Price</dt>
        <dd>{current.price ? `$${current.price}` : "—"}</dd>
      </dl>
      <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary border-t border-border-subtle pt-3">
        Platform status
      </div>
      <div className="text-text-tertiary text-sm">No platforms wired yet.</div>
    </aside>
  );
}
