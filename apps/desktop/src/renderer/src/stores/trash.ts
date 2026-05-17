import { create } from "zustand";
import { tracks } from "@/api/tracks";
import type { Track } from "@/api/tracks";

interface TrashState {
  list: Track[];
  loading: boolean;
  refresh(): Promise<void>;
}

export const useTrashStore = create<TrashState>((set) => ({
  list: [],
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      const list = await tracks.listTrash();
      set({ list, loading: false });
    } catch {
      set({ list: [], loading: false });
    }
  },
}));
