import { create } from "zustand";

import { libraries, Library } from "@/api/libraries";

interface LibraryState {
  active: Library | null;
  list: Library[];
  loading: boolean;
  refresh(): Promise<void>;
  init(path: string): Promise<void>;
  switchTo(path: string): Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  active: null,
  list: [],
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      const active = await libraries.active();
      const list = active ? await libraries.list() : [];
      set({ active, list });
    } finally {
      set({ loading: false });
    }
  },
  async init(path: string) {
    await libraries.init(path);
    await window.beatos.setLastLibrary(path);
    await get().refresh();
  },
  async switchTo(path: string) {
    await libraries.init(path);
    await window.beatos.setLastLibrary(path);
    await get().refresh();
  },
}));
