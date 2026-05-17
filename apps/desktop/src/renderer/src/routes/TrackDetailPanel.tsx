import React, { useMemo } from "react";

import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { CoverImage } from "@/components/CoverImage";

export function TrackDetailPanel(): React.JSX.Element {
  const current = useTrackStore((s) => s.current);
  const byTrack = useAssetStore((s) => s.byTrack);
  const coverAsset = useMemo(() => {
    if (!current) return null;
    const list = byTrack[current.id];
    if (!list) return null;
    return list.find((a) => a.role === "cover") ?? null;
  }, [byTrack, current]);

  if (!current) {
    return (
      <aside className="beatos-scroll w-[360px] bg-bg-elevated border-l border-border-subtle p-4">
        <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          Now Focused
        </div>
        <div className="mt-2 text-text-tertiary text-sm">Select a track to see details.</div>
      </aside>
    );
  }

  return (
    <aside className="beatos-scroll w-[360px] bg-bg-elevated border-l border-border-subtle p-4 flex flex-col gap-4 overflow-y-auto">
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
        <CoverImage assetId={coverAsset?.id ?? null} size={320} className="w-full" />
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
