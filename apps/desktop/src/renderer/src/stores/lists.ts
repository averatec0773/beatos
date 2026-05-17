import { create } from "zustand";

import { List, ListKind, lists as api } from "@/api/lists";

interface ListState {
  all: List[];
  currentListId: number | null;
  loading: boolean;
  refresh(): Promise<void>;
  create(name: string, kind?: ListKind): Promise<List>;
  remove(id: number): Promise<void>;
  rename(id: number, name: string): Promise<void>;
  reorder(ids: number[]): Promise<void>;
  selectList(id: number | null): void;
  addTrack(listId: number, trackId: number): Promise<void>;
  removeTrack(listId: number, trackId: number): Promise<void>;
}

export const useListStore = create<ListState>((set, get) => ({
  all: [],
  currentListId: null,
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      const all = await api.all();
      set({ all });
    } finally {
      set({ loading: false });
    }
  },
  async create(name, kind = "user") {
    const l = await api.create(name, kind);
    set({ all: [...get().all, l] });
    return l;
  },
  async remove(id) {
    await api.remove(id);
    set({
      all: get().all.filter((l) => l.id !== id),
      currentListId: get().currentListId === id ? null : get().currentListId,
    });
  },
  async rename(id, name) {
    const updated = await api.rename(id, name);
    set({ all: get().all.map((l) => (l.id === id ? updated : l)) });
  },
  async reorder(ids) {
    const prev = get().all;
    const userIds = new Set(ids);
    const systemLists = prev.filter((l) => !userIds.has(l.id));
    const optimistic = [
      ...systemLists,
      ...ids.map((id) => prev.find((l) => l.id === id)).filter((l): l is List => l != null),
    ];
    set({ all: optimistic });
    try {
      await api.reorder(ids);
    } catch (e) {
      console.warn("[lists] reorder failed, reverting:", e);
      const refreshed = await api.all();
      set({ all: refreshed });
    }
  },
  selectList(id) {
    set({ currentListId: id });
  },
  async addTrack(listId, trackId) {
    await api.addTrack(listId, trackId);
  },
  async removeTrack(listId, trackId) {
    await api.removeTrack(listId, trackId);
  },
}));
