import { create } from "zustand";

import type { Track } from "@/api/tracks";

interface SearchState {
  query: string;
  setQuery(q: string): void;
  filter(tracks: Track[]): Track[];
  clear(): void;
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  setQuery(q) {
    set({ query: q });
  },
  filter(tracks) {
    const q = normalize(get().query);
    if (!q) return tracks;
    return tracks.filter((t) => {
      if (normalize(t.title).includes(q)) return true;
      if (t.genre && t.genre.some((g) => normalize(g).includes(q))) return true;
      if (t.tags && t.tags.some((tag) => normalize(tag).includes(q))) return true;
      return false;
    });
  },
  clear() {
    set({ query: "" });
  },
}));
