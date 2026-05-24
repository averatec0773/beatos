import { create } from "zustand";
import { tracks } from "@/api/tracks";
import type { Track } from "@/api/tracks";

interface TrashState {
  list: Track[];
  loading: boolean;
  selectedIds: Set<number>;
  anchorId: number | null;
  refresh(): Promise<void>;
  selectOne(id: number, mode: "replace" | "toggle" | "range"): void;
  selectAll(): void;
  clearSelection(): void;
}

export const useTrashStore = create<TrashState>((set, get) => ({
  list: [],
  loading: false,
  selectedIds: new Set(),
  anchorId: null,
  async refresh() {
    set({ loading: true });
    try {
      const list = await tracks.listTrash();
      // Drop any stale selection that no longer corresponds to a trashed row
      // (e.g. after Restore / Permanently delete of a selected item).
      const ids = new Set(list.map((t) => t.id));
      const next = new Set<number>();
      for (const id of get().selectedIds) if (ids.has(id)) next.add(id);
      set({ list, loading: false, selectedIds: next });
    } catch {
      set({ list: [], loading: false, selectedIds: new Set(), anchorId: null });
    }
  },
  selectOne(id, mode) {
    const state = get();
    if (mode === "replace") {
      set({ selectedIds: new Set([id]), anchorId: id });
      return;
    }
    if (mode === "toggle") {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ selectedIds: next, anchorId: id });
      return;
    }
    // range
    if (state.anchorId == null) {
      set({ selectedIds: new Set([id]), anchorId: id });
      return;
    }
    const ids = state.list.map((t) => t.id);
    const aIdx = ids.indexOf(state.anchorId);
    const bIdx = ids.indexOf(id);
    if (aIdx < 0 || bIdx < 0) {
      set({ selectedIds: new Set([id]), anchorId: id });
      return;
    }
    const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
    set({ selectedIds: new Set(ids.slice(lo, hi + 1)) });
  },
  selectAll() {
    const ids = get().list.map((t) => t.id);
    if (ids.length === 0) return;
    set({ selectedIds: new Set(ids), anchorId: ids[0] ?? null });
  },
  clearSelection() {
    set({ selectedIds: new Set(), anchorId: null });
  },
}));
