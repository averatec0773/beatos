import { lists as listsApi } from "@/api/lists";
import { useListStore } from "@/stores/lists";
import { useToastStore } from "@/stores/toast";

/**
 * Add many tracks to a list and surface a single toast that distinguishes
 * three outcomes: newly added, already-in-list, and outright failure.
 *
 * Centralized here because both the DnD path (App.tsx onDragEnd) and the
 * BulkActionBar "Add to list" action need identical messaging. The backend
 * returns `{added: bool}` per call (idempotent INSERT OR IGNORE — see
 * `add_track_to_list` in packages/beatos-core/.../lists/membership.py).
 */
export async function addTracksToList(
  listId: number,
  trackIds: number[],
): Promise<{ addedNew: number; alreadyIn: number; failed: number }> {
  const results = await Promise.allSettled(trackIds.map((tid) => listsApi.addTrack(listId, tid)));
  let addedNew = 0;
  let alreadyIn = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "rejected") failed += 1;
    else if (r.value.added) addedNew += 1;
    else alreadyIn += 1;
  }
  const listName = useListStore.getState().all.find((l) => l.id === listId)?.name ?? `#${listId}`;
  const toast = useToastStore.getState();
  const total = trackIds.length;
  if (failed === total) {
    toast.show("error", `Failed to add to "${listName}"`);
  } else if (failed > 0) {
    toast.show("warning", `Added ${addedNew}/${total} to "${listName}" — ${failed} failed`);
  } else if (addedNew === 0 && alreadyIn === total) {
    toast.show(
      "info",
      total === 1 ? `Already in "${listName}"` : `All ${total} tracks already in "${listName}"`,
    );
  } else if (alreadyIn > 0) {
    toast.show("warning", `Added ${addedNew} to "${listName}" — ${alreadyIn} already in list`);
  } else {
    toast.show(
      "success",
      addedNew === 1
        ? `Added 1 track to "${listName}"`
        : `Added ${addedNew} tracks to "${listName}"`,
    );
  }
  await useListStore.getState().refresh();
  // Membership changed → force the sidebar mosaic + playlist track fetch to
  // refetch even when listId is unchanged (e.g. dropping into the list you're
  // already viewing, 0→1 tracks — the cover used to stay empty).
  useListStore.getState().bumpMembership();
  return { addedNew, alreadyIn, failed };
}
