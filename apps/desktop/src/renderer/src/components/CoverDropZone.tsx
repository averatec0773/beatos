import { useState } from "react";
import { Image as ImageIcon, MoreHorizontal, AlertTriangle, RefreshCw } from "lucide-react";

import { useAssetSlot } from "@/hooks/useAssetSlot";
import { useSourceStore } from "@/stores/sources";
import { isPathOffline } from "@/lib/sourceOffline";
import { OfflineBadge } from "./OfflineBadge";
import { CoverImage } from "./CoverImage";

const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export function CoverDropZone({ trackId }: { trackId: number }) {
  const { asset, pickAndAttach, detach, relocate, reveal } = useAssetSlot(
    trackId, "cover", "Cover", COVER_EXTENSIONS
  );
  const sources = useSourceStore((s) => s.all);
  const offline = asset ? isPathOffline(asset.abs_path, sources) : false;
  const [menuOpen, setMenuOpen] = useState(false);

  if (asset && asset.missing) {
    return (
      <div className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 bg-bg-elevated border border-danger rounded-md text-danger p-2 text-center">
        <AlertTriangle size={16} />
        <span className="text-xs">Cover · Missing</span>
        <button type="button" onClick={relocate} className="mt-1 inline-flex items-center gap-1 text-xs underline hover:no-underline">
          <RefreshCw size={10} /> Find file
        </button>
      </div>
    );
  }

  if (!asset) {
    return (
      <button
        type="button"
        data-cover-dropzone
        onClick={() => pickAndAttach(false)}
        className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-md text-text-tertiary hover:text-text-secondary hover:border-text-tertiary transition"
      >
        <ImageIcon size={32} />
        <span className="text-xs">+ Cover</span>
      </button>
    );
  }

  return (
    <div
      data-cover-dropzone
      className="relative w-[200px] h-[200px] bg-bg-elevated border border-border-subtle rounded-md overflow-hidden group"
    >
      <CoverImage assetId={asset.id} size={200} />
      {offline && <OfflineBadge className="absolute top-2 left-2" />}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
        aria-label="Cover actions"
      >
        <MoreHorizontal size={14} />
      </button>
      {menuOpen && (
        <div
          className="absolute right-2 top-10 bg-bg-elevated border border-border-subtle rounded-md shadow-lg text-sm z-10 w-44"
          onClick={() => setMenuOpen(false)}
        >
          <button type="button" onClick={reveal} disabled={offline}
            className={`w-full text-left px-3 py-2 ${offline ? "text-text-tertiary opacity-50 cursor-not-allowed" : "hover:bg-bg-row-hover"}`}
          >
            Reveal in Finder
          </button>
          <button type="button" onClick={() => pickAndAttach(true)} disabled={offline}
            className={`w-full text-left px-3 py-2 ${offline ? "text-text-tertiary opacity-50 cursor-not-allowed" : "hover:bg-bg-row-hover"}`}
          >
            Replace…
          </button>
          <button type="button" onClick={detach} disabled={offline}
            className={`w-full text-left px-3 py-2 text-danger ${offline ? "opacity-50 cursor-not-allowed" : "hover:bg-bg-row-hover"}`}
          >
            Detach
          </button>
        </div>
      )}
    </div>
  );
}
