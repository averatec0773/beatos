import { create } from "zustand";

import { Track, TrackUpdate, tracks as api } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";
import { useSourceStore } from "./sources";
import { useAssetStore } from "./assets";

interface TrackState {
  list: Track[];
  current: Track | null;
  loading: boolean;
  selectedIds: Set<number>;
  anchorId: number | null;
  refresh(opts?: { list_id?: number }): Promise<void>;
  select(id: number | null): void;
  selectOne(id: number, mode: "replace" | "toggle" | "range"): void;
  clearSelection(): void;
  create(title: string): Promise<Track>;
  update(id: number, updates: TrackUpdate): Promise<Track>;
  remove(id: number): Promise<void>;
}

export const useTrackStore = create<TrackState>((set, get) => ({
  list: [],
  current: null,
  loading: false,
  selectedIds: new Set(),
  anchorId: null,
  async refresh(opts) {
    set({ loading: true });
    try {
      let list: Track[];
      if (opts?.list_id != null) {
        list = await api.list({ list_id: opts.list_id });
      } else {
        const filter = useSourceStore.getState().activeFilter;
        list = filter !== null ? await api.list({ source_id: filter }) : await api.list({});
      }
      set({ list, loading: false, selectedIds: new Set(), anchorId: null });
    } catch {
      set({ list: [], loading: false });
    }
  },
  select(id) {
    if (id == null) {
      set({ current: null });
      return;
    }
    const found = get().list.find((t) => t.id === id) ?? null;
    set({ current: found });
    if (found) {
      assetsApi
        .listForTrack(found.id)
        .then((list) => useAssetStore.getState().setForTrack(found.id, list))
        .catch((e) => console.warn("[tracks.select] fetch assets failed:", e));
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
    // anchorId stays unchanged for range
  },
  clearSelection() {
    set({ selectedIds: new Set(), anchorId: null });
  },
  async create(title) {
    const t = await api.create(title);
    set({ list: [...get().list, t] });
    return t;
  },
  async update(id, updates) {
    const t = await api.update(id, updates);
    set({
      list: get().list.map((x) => (x.id === id ? t : x)),
      current: get().current?.id === id ? t : get().current,
    });
    return t;
  },
  async remove(id) {
    await api.remove(id);
    set({
      list: get().list.filter((x) => x.id !== id),
      current: get().current?.id === id ? null : get().current,
    });
  },
}));

useSourceStore.subscribe((state, prev) => {
  if (state.activeFilter !== prev.activeFilter) {
    useTrackStore.getState().refresh();
  }
});
