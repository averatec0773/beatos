import { create } from "zustand";

export type ColumnKey = "title" | "bpm" | "key" | "genre" | "updated";

interface ColumnWidthState {
  widths: Record<ColumnKey, number>;
  setWidth(key: ColumnKey, px: number): void;
  resetAll(): void;
}

const DEFAULTS: Record<ColumnKey, number> = {
  title: 0,
  bpm: 80,
  key: 96,
  genre: 144,
  updated: 96,
};

const MIN_WIDTH: Record<ColumnKey, number> = {
  title: 160,
  bpm: 56,
  key: 56,
  genre: 80,
  updated: 80,
};

export const useColumnWidthStore = create<ColumnWidthState>((set) => ({
  widths: { ...DEFAULTS },
  setWidth(key, px) {
    set((s) => ({ widths: { ...s.widths, [key]: Math.max(MIN_WIDTH[key], px) } }));
  },
  resetAll() {
    set({ widths: { ...DEFAULTS } });
  },
}));
