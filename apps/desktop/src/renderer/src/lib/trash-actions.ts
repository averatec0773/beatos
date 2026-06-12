import type { TFunction } from "i18next";

import { tracks as tracksApi } from "@/api/tracks";
import { useTrackStore } from "@/stores/tracks";
import { useTrashStore } from "@/stores/trash";
import { useToastStore } from "@/stores/toast";

const UNDO_TOAST_MS = 7000;

async function refreshAfterTrashChange(): Promise<void> {
  // refresh() inherits the active list scope; refreshTotal + trash keep the
  // sidebar count and the Trash view in sync.
  await useTrackStore.getState().refresh();
  void useTrackStore.getState().refreshTotal();
  void useTrashStore.getState().refresh();
}

/** Un-delete the given tracks (the Undo action) and refresh the views. */
export async function restoreTracks(ids: number[], t: TFunction): Promise<void> {
  const restored: number[] = [];
  for (const id of ids) {
    try {
      await tracksApi.restore(id);
      restored.push(id);
    } catch (e) {
      console.warn("[undo-trash] restore failed for", id, e);
    }
  }
  await refreshAfterTrashChange();
  if (restored.length) {
    useToastStore.getState().show("success", t("trash.restored", { count: restored.length }));
  }
}

/**
 * Move the given tracks to Trash, then show a success toast with an Undo action
 * that restores exactly the ones that were trashed. Used by every trash entry
 * point (bulk bar, row, context menu, editor) so undo is always offered.
 */
export async function trashTracksWithUndo(ids: number[], t: TFunction): Promise<void> {
  const trashed: number[] = [];
  for (const id of ids) {
    try {
      await tracksApi.remove(id);
      trashed.push(id);
    } catch (e) {
      console.warn("[trash] failed for", id, e);
    }
  }
  await refreshAfterTrashChange();
  if (!trashed.length) return;
  useToastStore
    .getState()
    .show(
      "success",
      trashed.length === 1
        ? t("trackList.movedToTrash")
        : t("trackList.movedToTrashMany", { count: trashed.length }),
      UNDO_TOAST_MS,
      { label: t("common.undo"), onClick: () => void restoreTracks(trashed, t) },
    );
}
