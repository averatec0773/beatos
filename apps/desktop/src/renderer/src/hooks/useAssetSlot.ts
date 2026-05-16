import { useAssetStore } from "@/stores/assets";
import { useDialogStore } from "@/stores/dialogs";
import { ApiError } from "@/api/client";
import type { Asset } from "@/api/assets";
import type { Source } from "@/api/sources";

interface UseAssetSlotResult {
  asset: Asset | null;
  pickAndAttach: (replace: boolean) => Promise<void>;
  detach: () => Promise<void>;
  relocate: () => Promise<void>;
  reveal: () => void;
}

export function useAssetSlot(
  trackId: number,
  role: string,
  label: string,
  extensions: string[]
): UseAssetSlotResult {
  const assetsForTrack = useAssetStore((s) => s.byTrack[trackId] ?? []);
  const attachAction = useAssetStore((s) => s.attach);
  const detachAction = useAssetStore((s) => s.detach);
  const relocateAction = useAssetStore((s) => s.relocate);
  const openOutOfSource = useDialogStore((s) => s.openOutOfSource);

  const asset = assetsForTrack.find((a) => a.role === role) ?? null;
  const filterExtensions = extensions.map((e) => e.replace(/^\./, ""));

  const pickAndAttach = async (replace: boolean) => {
    const picked = await window.beatos.openFileDialog([
      { name: label, extensions: filterExtensions },
    ]);
    if (!picked) return;
    try {
      await attachAction(trackId, role, picked, { replace });
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 422 &&
        typeof e.body === "object" && e.body !== null &&
        (e.body as { error?: string }).error === "out_of_source"
      ) {
        const body = e.body as { path: string; available_sources: Source[] };
        openOutOfSource({
          filePath: body.path,
          availableSources: body.available_sources,
          onResolved: (resolvedPath: string) => {
            attachAction(trackId, role, resolvedPath, { replace }).catch((err) => {
              alert(`Attach failed: ${err instanceof Error ? err.message : String(err)}`);
            });
          },
        });
        return;
      }
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
