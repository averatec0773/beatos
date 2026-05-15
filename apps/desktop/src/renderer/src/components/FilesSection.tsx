import React from "react";

import { AssetSlot } from "@/components/AssetSlot";
import { useAssetStore } from "@/stores/assets";
import type { Asset, AssetRole } from "@/api/assets";

interface Props {
  trackId: number;
}

const FILTERS: Record<AssetRole, { name: string; extensions: string[] }[]> = {
  audio: [{ name: "Audio", extensions: ["wav", "mp3", "aif", "aiff", "flac"] }],
  stems: [{ name: "Stems", extensions: ["zip", "wav", "aif"] }],
  cover: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp"] }],
};

export function FilesSection({ trackId }: Props): React.JSX.Element {
  const byTrack = useAssetStore((s) => s.byTrack);
  const attach = useAssetStore((s) => s.attach);
  const detach = useAssetStore((s) => s.detach);
  const relocate = useAssetStore((s) => s.relocate);

  const assetList = byTrack[trackId] ?? [];
  const audio = assetList.find((a) => a.role === "audio") ?? null;
  const stems = assetList.find((a) => a.role === "stems") ?? null;
  const cover = assetList.find((a) => a.role === "cover") ?? null;

  async function onAttach(role: AssetRole): Promise<void> {
    const picked = await window.beatos.openFileDialog(FILTERS[role]);
    if (!picked) return;
    await attach(trackId, role, picked);
  }

  async function onDetach(a: Asset): Promise<void> {
    await detach(trackId, a.id);
  }

  async function onRelocate(a: Asset): Promise<void> {
    const picked = await window.beatos.openFileDialog([
      {
        name: "Audio / Image / Stems",
        extensions: ["wav", "mp3", "aif", "aiff", "flac", "zip", "jpg", "jpeg", "png", "webp"],
      },
    ]);
    if (!picked) return;
    try {
      await relocate(trackId, a.id, picked);
    } catch (e) {
      alert(`Relocate failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function onReveal(a: Asset): void {
    window.beatos.revealInFinder(a.abs_path);
  }

  function onMoveStub(): void {
    alert("Move into library — coming in v0.0.4.");
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-2">
        Files
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <AssetSlot
          role="audio"
          asset={audio}
          onAttach={onAttach}
          onDetach={onDetach}
          onReveal={onReveal}
          onRelocate={onRelocate}
          onMoveIntoLibrary={onMoveStub}
        />
        <AssetSlot
          role="stems"
          asset={stems}
          onAttach={onAttach}
          onDetach={onDetach}
          onReveal={onReveal}
          onRelocate={onRelocate}
          onMoveIntoLibrary={onMoveStub}
        />
        <AssetSlot
          role="cover"
          asset={cover}
          onAttach={onAttach}
          onDetach={onDetach}
          onReveal={onReveal}
          onRelocate={onRelocate}
          onMoveIntoLibrary={onMoveStub}
        />
      </div>
    </div>
  );
}
