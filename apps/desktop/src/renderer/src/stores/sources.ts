import { create } from "zustand";
import { sources, type Source, type SourceCreate } from "@/api/sources";

interface SourceState {
  all: Source[];
  activeFilter: number | null;
  hasLoaded: boolean;
  loadError: Error | null;
  refresh: () => Promise<void>;
  add: (payload: SourceCreate) => Promise<Source>;
  rename: (id: number, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  reorder: (ids: number[]) => Promise<void>;
  setFilter: (id: number | null) => void;
}

export const useSourceStore = create<SourceState>((set, get) => ({
  all: [],
  activeFilter: null,
  hasLoaded: false,
  loadError: null,

  async refresh() {
    try {
      const all = await sources.list();
      set({ all, hasLoaded: true, loadError: null });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn("[sources] refresh failed:", err);
      set({ hasLoaded: true, loadError: err });
    }
  },

  async add(payload) {
    const s = await sources.create(payload);
    await get().refresh();
    return s;
  },

  async rename(id, name) {
    await sources.update(id, { name });
    await get().refresh();
  },

  async remove(id) {
    await sources.remove(id);
    set((s) => ({
      activeFilter: s.activeFilter === id ? null : s.activeFilter,
    }));
    await get().refresh();
  },

  async reorder(ids) {
    const prev = get().all;
    const optimistic = ids
      .map((id) => prev.find((s) => s.id === id))
      .filter((s): s is Source => s != null);
    set({ all: optimistic });
    try {
      await sources.reorder(ids);
    } catch (e) {
      console.warn("[sources] reorder failed, reverting:", e);
      await get().refresh();
    }
  },

  setFilter(id) {
    set({ activeFilter: id });
  },
}));
