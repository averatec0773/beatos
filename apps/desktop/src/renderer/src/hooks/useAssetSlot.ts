import { useAssetStore } from "@/stores/assets";
import type { Asset } from "@/api/assets";

interface UseAssetSlotResult {
  asset: Asset | null;
  /** If `explicitPath` is provided, bypass the OS file picker. */
  pickAndAttach: (replace: boolean, explicitPath?: string) => Promise<void>;
  detach: () => Promise<void>;
  relocate: () => Promise<void>;
  reveal: () => void;
}

export function useAssetSlot(
  trackId: number,
  role: string,
  label: string,
  extensions: string[],
): UseAssetSlotResult {
  const assetsForTrack = useAssetStore((s) => s.byTrack[trackId] ?? []);
  const attachAction = useAssetStore((s) => s.attach);
  const detachAction = useAssetStore((s) => s.detach);
  const relocateAction = useAssetStore((s) => s.relocate);

  const asset = assetsForTrack.find((a) => a.role === role) ?? null;
  const filterExtensions = extensions.map((e) => e.replace(/^\./, ""));

  const pickAndAttach = async (replace: boolean, explicitPath?: string) => {
    const picked =
      explicitPath ??
      (await window.beatos.openFileDialog([{ name: label, extensions: filterExtensions }]));
    if (!picked) return;
    try {
      await attachAction(trackId, role, picked, { replace });
    } catch (e) {
      alert(`Attach failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const detach = async () => {
    if (!asset) return;
    await detachAction(trackId, asset.id);
  };

  const relocate = async () => {
    if (!asset) return;
    const picked = await window.beatos.openFileDialog([
      { name: label, extensions: filterExtensions },
    ]);
    if (!picked) return;
    try {
      await relocateAction(trackId, asset.id, picked);
    } catch (e) {
      alert(`Relocate failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const reveal = () => {
    if (!asset) return;
    window.beatos.revealInFinder(asset.abs_path);
  };

  return { asset, pickAndAttach, detach, relocate, reveal };
}
