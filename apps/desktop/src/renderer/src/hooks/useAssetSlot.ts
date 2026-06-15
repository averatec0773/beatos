import { useTranslation } from "react-i18next";

import { platform } from "@/platform";
import { useAssetStore } from "@/stores/assets";
import { useToastStore } from "@/stores/toast";
import type { Asset } from "@/api/assets";

// Stable reference for the empty case so the selector doesn't return a fresh []
// (and force a re-render) whenever an unrelated track's assets mutate byTrack.
const EMPTY: Asset[] = [];

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
  format: string,
  label: string,
  extensions: string[],
): UseAssetSlotResult {
  const { t } = useTranslation();
  const assetsForTrack = useAssetStore((s) => s.byTrack[trackId] ?? EMPTY);
  const attachAction = useAssetStore((s) => s.attach);
  const detachAction = useAssetStore((s) => s.detach);
  const relocateAction = useAssetStore((s) => s.relocate);

  // Slot identity is (role, format) now — format rides on the file's extension.
  const asset = assetsForTrack.find((a) => a.role === role && a.format === format) ?? null;
  const filterExtensions = extensions.map((e) => e.replace(/^\./, ""));

  const pickAndAttach = async (replace: boolean, explicitPath?: string) => {
    const picked =
      explicitPath ??
      (await platform.openFileDialog([{ name: label, extensions: filterExtensions }]));
    if (!picked) return;
    try {
      await attachAction(trackId, role, picked, { replace });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      useToastStore.getState().show("error", t("errors.attachFailed", { detail }));
    }
  };

  const detach = async () => {
    if (!asset) return;
    await detachAction(trackId, asset.id);
  };

  const relocate = async () => {
    if (!asset) return;
    const picked = await platform.openFileDialog([{ name: label, extensions: filterExtensions }]);
    if (!picked) return;
    try {
      await relocateAction(trackId, asset.id, picked);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      useToastStore.getState().show("error", t("errors.relocateFailed", { detail }));
    }
  };

  const reveal = () => {
    if (!asset) return;
    platform.revealInFinder(asset.abs_path);
  };

  return { asset, pickAndAttach, detach, relocate, reveal };
}
