import { create } from "zustand";
import { sources, type Source, type SourceCreate } from "@/api/sources";

interface SourceState {
  all: Source[];
  activeFilter: number | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  add: (payload: SourceCreate) => Promise<Source>;
  rename: (id: number, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  setFilter: (id: number | null) => void;
}

export const useSourceStore = create<SourceState>((set, get) => ({
  all: [],
  activeFilter: null,
  hasLoaded: false,

  async refresh() {
    try {
      const all = await sources.list();
      set({ all, hasLoaded: true });
    } catch (e) {
      console.warn("[sources] refresh failed:", e);
      set({ hasLoaded: true });
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

  setFilter(id) {
    set({ activeFilter: id });
  },
}));
