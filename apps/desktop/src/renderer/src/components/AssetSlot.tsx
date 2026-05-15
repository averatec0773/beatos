import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Image as ImageIconLucide,
  Layers,
  MoreHorizontal,
  Music,
  RefreshCw,
} from "lucide-react";

import { Asset, AssetRole } from "@/api/assets";
import { CoverImage } from "@/components/CoverImage";

interface Props {
  role: AssetRole;
  asset: Asset | null;
  onAttach: (role: AssetRole) => Promise<void> | void;
  onDetach: (asset: Asset) => Promise<void> | void;
  onReveal: (asset: Asset) => void;
  onRelocate: (asset: Asset) => Promise<void> | void;
  onMoveIntoLibrary: (asset: Asset) => void;
}

function ROLE_LABEL(role: AssetRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function ROLE_ICON(role: AssetRole): React.JSX.Element {
  if (role === "audio") return <Music size={14} />;
  if (role === "stems") return <Layers size={14} />;
  return <ImageIconLucide size={14} />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function AssetSlot({
  role,
  asset,
  onAttach,
  onDetach,
  onReveal,
  onRelocate,
  onMoveIntoLibrary,
}: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (asset == null) {
    return (
      <button
        type="button"
        onClick={() => onAttach(role)}
        className="aspect-square flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-md text-text-tertiary hover:text-text-secondary hover:border-text-tertiary transition"
      >
        {ROLE_ICON(role)}
        <span className="text-xs">+ Attach {ROLE_LABEL(role)}</span>
      </button>
    );
  }

  if (asset.missing) {
    return (
      <div className="aspect-square flex flex-col items-center justify-center gap-2 bg-bg-elevated border border-danger rounded-md text-danger p-2 text-center">
        <AlertTriangle size={16} />
        <span className="text-xs">Missing</span>
        <button
          type="button"
          onClick={() => onRelocate(asset)}
          className="mt-1 inline-flex items-center gap-1 text-xs underline hover:no-underline"
        >
          <RefreshCw size={10} /> Find file
        </button>
      </div>
    );
  }

  const filename = asset.abs_path.split("/").pop() ?? asset.abs_path;

  return (
    <div ref={menuRef} className="aspect-square bg-bg-elevated border border-border-subtle rounded-md p-3 flex flex-col gap-2 relative">
      <div className="flex items-center gap-2 text-text-tertiary text-[10px] uppercase tracking-[0.05em] font-semibold">
        {ROLE_ICON(role)}
        <span>{ROLE_LABEL(role)}</span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-bg-row-hover text-text-secondary"
          aria-label={`${role} actions`}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {role === "cover" ? (
        <div className="flex-1 flex items-center justify-center">
          <CoverImage assetId={asset.id} size={80} />
        </div>
      ) : (
        <div className="flex-1 text-xs text-text-secondary break-words" title={asset.abs_path}>
          <div className="text-text-primary font-medium truncate">{filename}</div>
          <div className="font-mono">{formatSize(asset.size_bytes)}</div>
        </div>
      )}

      {menuOpen && (
        <div
          className="absolute right-2 top-8 bg-bg-elevated border border-border-subtle rounded-md shadow-lg text-sm z-10 w-44"
          onClick={() => setMenuOpen(false)}
        >
          <button
            type="button"
            onClick={() => onReveal(asset)}
            className="w-full text-left px-3 py-2 hover:bg-bg-row-hover"
          >
            Reveal in Finder
          </button>
          <button
            type="button"
            onClick={() => onMoveIntoLibrary(asset)}
            className="w-full text-left px-3 py-2 text-text-tertiary cursor-not-allowed"
            disabled
            title="Coming in v0.0.4"
          >
            Move into library…
          </button>
          <button
            type="button"
            onClick={() => onDetach(asset)}
            className="w-full text-left px-3 py-2 text-danger hover:bg-bg-row-hover"
          >
            Detach
          </button>
        </div>
      )}
    </div>
  );
}
