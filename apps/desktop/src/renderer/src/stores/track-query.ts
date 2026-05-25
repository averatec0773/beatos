import { create } from "zustand";

export type SortBy = "updated_at" | "title" | "bpm" | "key_signature" | "genre" | "producer";
export type SortDir = "asc" | "desc";

export interface TrackFilters {
  producers: string[];
  genres: string[];
  moods: string[];
  keys: string[];
  bpm_min: number | null;
  bpm_max: number | null;
  has_audio: boolean | null;
}

const DEFAULT_FILTERS: TrackFilters = {
  producers: [],
  genres: [],
  moods: [],
  keys: [],
  bpm_min: null,
  bpm_max: null,
  has_audio: null,
};

interface TrackQueryState {
  sortBy: SortBy;
  sortDir: SortDir;
  filters: TrackFilters;
  q: string;
  toggleSort(field: SortBy): void;
  setProducerFilter(values: string[]): void;
  setGenreFilter(values: string[]): void;
  setMoodFilter(values: string[]): void;
  setKeyFilter(values: string[]): void;
  setBpmRange(min: number | null, max: number | null): void;
  setHasAudio(value: boolean | null): void;
  removeFilter(field: keyof TrackFilters, value?: string): void;
  clearAllFilters(): void;
  setText(value: string): void;
}

export const useTrackQueryStore = create<TrackQueryState>((set, get) => ({
  sortBy: "updated_at",
  sortDir: "desc",
  filters: { ...DEFAULT_FILTERS },
  q: "",

  toggleSort(field) {
    const { sortBy, sortDir } = get();
    if (sortBy === field) {
      set({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      set({ sortBy: field, sortDir: "asc" });
    }
  },

  setProducerFilter(values) {
    set((s) => ({ filters: { ...s.filters, producers: values } }));
  },

  setGenreFilter(values) {
    set((s) => ({ filters: { ...s.filters, genres: values } }));
  },

  setMoodFilter(values) {
    set((s) => ({ filters: { ...s.filters, moods: values } }));
  },

  setKeyFilter(values) {
    set((s) => ({ filters: { ...s.filters, keys: values } }));
  },

  setBpmRange(min, max) {
    set((s) => ({ filters: { ...s.filters, bpm_min: min, bpm_max: max } }));
  },

  setHasAudio(value) {
    set((s) => ({ filters: { ...s.filters, has_audio: value } }));
  },

  removeFilter(field, value) {
    const { filters } = get();
    if (field === "producers" || field === "genres" || field === "moods" || field === "keys") {
      const current = filters[field] as string[];
      const next = value !== undefined ? current.filter((v) => v !== value) : [];
      set((s) => ({ filters: { ...s.filters, [field]: next } }));
    } else {
      set((s) => ({ filters: { ...s.filters, [field]: null } }));
    }
  },

  clearAllFilters() {
    set({ filters: { ...DEFAULT_FILTERS }, q: "" });
  },

  setText(value) {
    set({ q: value });
  },
}));
