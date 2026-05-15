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
