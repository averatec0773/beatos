import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Image as ImageIconLucide,
  Layers,
  MoreHorizontal,
  Music,
  RefreshCw,
} from "lucide-react";

import { useAssetStore } from "@/stores/assets";
import { CoverImage } from "@/components/CoverImage";
import { OfflineBadge } from "./OfflineBadge";
import type { Asset } from "@/api/assets";

interface Props {
  trackId: number;
  role: string;
  label: string;
  extensions: string[];
}

function roleIcon(role: string): React.JSX.Element {
  if (role === "cover") return <ImageIconLucide size={14} />;
  if (role === "stems") return <Layers size={14} />;
  return <Music size={14} />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function AssetSlot({ trackId, role, label, extensions }: Props): React.JSX.Element {
  const assetsForTrack = useAssetStore((s) => s.byTrack[trackId] ?? []);
  const attach = useAssetStore((s) => s.attach);
  const detach = useAssetStore((s) => s.detach);
  const relocate = useAssetStore((s) => s.relocate);

  // Derive the asset for this role in component body — never inside the selector
  // (see feedback_zustand_stable_selectors).
  const asset: Asset | null = assetsForTrack.find((a) => a.role === role) ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const filterExtensions = extensions.map((e) => e.replace(/^\./, ""));

  async function pickAndAttach(replace: boolean): Promise<void> {
    const picked = await window.beatos.openFileDialog([
      { name: label, extensions: filterExtensions },
    ]);
    if (!picked) return;
    try {
      await attach(trackId, role, picked, { replace });
    } catch (e) {
      alert(`Attach failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function onDetach(): Promise<void> {
    if (!asset) return;
    await detach(trackId, asset.id);
  }

  async function onRelocate(): Promise<void> {
    if (!asset) return;
    const picked = await window.beatos.openFileDialog([
      { name: label, extensions: filterExtensions },
    ]);
    if (!picked) return;
    try {
      await relocate(trackId, asset.id, picked);
    } catch (e) {
      alert(`Relocate failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function onReveal(): void {
    if (!asset) return;
    window.beatos.revealInFinder(asset.abs_path);
  }

  if (asset == null) {
    return (
      <button
        type="button"
        onClick={() => pickAndAttach(false)}
        className="aspect-square flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-md text-text-tertiary hover:text-text-secondary hover:border-text-tertiary transition"
      >
        {roleIcon(role)}
        <span className="text-xs">
          <span>+ </span>
          <span>{label}</span>
        </span>
      </button>
    );
  }

  if (asset.missing) {
    return (
      <div className="aspect-square flex flex-col items-center justify-center gap-2 bg-bg-elevated border border-danger rounded-md text-danger p-2 text-center">
        <AlertTriangle size={16} />
        <span className="text-xs">{label} · Missing</span>
        <button
          type="button"
          onClick={onRelocate}
          className="mt-1 inline-flex items-center gap-1 text-xs underline hover:no-underline"
        >
          <RefreshCw size={10} /> Find file
        </button>
      </div>
    );
  }

  const filename = asset.abs_path.split("/").pop() ?? asset.abs_path;

  return (
    <div
      ref={menuRef}
      className="aspect-square bg-bg-elevated border border-border-subtle rounded-md p-3 flex flex-col gap-2 relative"
    >
      <div className="flex items-center gap-2 text-text-tertiary text-[10px] uppercase tracking-[0.05em] font-semibold">
        {roleIcon(role)}
        <span>{label}</span>
        <OfflineBadge missing={asset.missing} className="ml-1" />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-bg-row-hover text-text-secondary"
          aria-label={`${label} actions`}
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
            onClick={onReveal}
            className="w-full text-left px-3 py-2 hover:bg-bg-row-hover"
          >
            Reveal in Finder
          </button>
          <button
            type="button"
            onClick={() => pickAndAttach(true)}
            className="w-full text-left px-3 py-2 hover:bg-bg-row-hover"
          >
            Replace file…
          </button>
          <button
            type="button"
            onClick={onDetach}
            className="w-full text-left px-3 py-2 text-danger hover:bg-bg-row-hover"
          >
            Detach
          </button>
        </div>
      )}
    </div>
  );
}
