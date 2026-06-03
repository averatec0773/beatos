import { create } from "zustand";

import { Track, TrackUpdate, tracks as api } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";
import { applyDefaultLicenseTiers } from "@/lib/default-license-tiers";
import { applyDefaultIsFree, loadDefaultIsFree } from "@/lib/default-free";
import { useAssetStore } from "./assets";
import { useTrackQueryStore } from "./track-query";
import { useTrashStore } from "./trash";

interface TrackState {
  list: Track[];
  total: number | null;
  current: Track | null;
  loading: boolean;
  selectedIds: Set<number>;
  anchorId: number | null;
  refresh(opts?: { list_id?: number }): Promise<void>;
  refreshTotal(): Promise<void>;
  select(id: number | null): void;
  selectOne(id: number, mode: "replace" | "toggle" | "range"): void;
  selectAll(): void;
  clearSelection(): void;
  create(title: string): Promise<Track>;
  update(id: number, updates: TrackUpdate): Promise<Track>;
  remove(id: number): Promise<void>;
}

export const useTrackStore = create<TrackState>((set, get) => ({
  list: [],
  total: null,
  current: null,
  loading: false,
  selectedIds: new Set(),
  anchorId: null,
  async refreshTotal() {
    try {
      const total = await api.count();
      set({ total });
    } catch (e) {
      console.warn("[tracks] refreshTotal failed", e);
    }
  },
  async refresh(opts) {
    set({ loading: true });
    try {
      const queryState = useTrackQueryStore.getState();
      const { filters } = queryState;
      const inList = opts?.list_id != null;
      const list = await api.list({
        list_id: opts?.list_id,
        // Only forward sort when not in a list (lists use position order)
        sort_by: inList ? undefined : queryState.sortBy,
        sort_dir: inList ? undefined : queryState.sortDir,
        // Filters apply to both library and list views
        producers: filters.producers,
        genres: filters.genres,
        moods: filters.moods,
        keys: filters.keys,
        bpm_min: filters.bpm_min,
        bpm_max: filters.bpm_max,
        has_audio: filters.has_audio,
        q: queryState.q || undefined,
      });
      // Reconcile `current` against the new list. Switching views (a list ↔ all
      // beats) replaces `list` but `current` is a stale object from the previous
      // view: if its track isn't in the new list the coverflow computes index
      // -1 and renders nothing (and the detail panel shows an out-of-view
      // track); if it IS present we must swap in the fresh object so downstream
      // memos don't hold a stale reference. Drop to null when it's gone — the
      // route re-auto-selects the first row.
      const cur = get().current;
      const current = cur ? (list.find((t) => t.id === cur.id) ?? null) : null;
      set({ list, loading: false, selectedIds: new Set(), anchorId: null, current });
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
  selectAll() {
    const ids = get().list.map((t) => t.id);
    if (ids.length === 0) return;
    set({
      selectedIds: new Set(ids),
      anchorId: ids[0] ?? null,
    });
  },
  clearSelection() {
    set({ selectedIds: new Set(), anchorId: null });
  },
  async create(title) {
    const t = await api.create(title);
    set({ list: [...get().list, t] });
    // Apply user-configured default license tiers in the background. This
    // never blocks track creation — applyDefaultLicenseTiers swallows its
    // own errors and logs them. Renderer-only flow; MCP create_tracks
    // intentionally does NOT pull defaults (agents typically want full
    // control over the tier set they're importing).
    await applyDefaultLicenseTiers(t.id);
    await applyDefaultIsFree(t.id);
    if (await loadDefaultIsFree()) {
      set({ list: get().list.map((x) => (x.id === t.id ? { ...x, is_free: true } : x)) });
    }
    void get().refreshTotal();
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
    void useTrashStore.getState().refresh();
    void get().refreshTotal();
  },
}));

useTrackQueryStore.subscribe(() => {
  useTrackStore.getState().refresh();
});
