import { create } from "zustand";

import { Track, TrackUpdate, tracks as api } from "@/api/tracks";

interface TrackState {
  list: Track[];
  current: Track | null;
  loading: boolean;
  refresh(): Promise<void>;
  select(id: number | null): void;
  create(title: string): Promise<Track>;
  update(id: number, updates: TrackUpdate): Promise<Track>;
  remove(id: number): Promise<void>;
}

export const useTrackStore = create<TrackState>((set, get) => ({
  list: [],
  current: null,
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      const list = await api.list();
      set({ list, loading: false });
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
