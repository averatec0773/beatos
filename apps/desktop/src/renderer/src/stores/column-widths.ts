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

// Per-column minimum px. `setWidth` clamps to these, and `getGridTemplateColumns`
// floors the flexible `title`/`updated` tracks at theirs so they can't collapse
// to nothing when the table container shrinks (e.g. the preview panel grows).
export const MIN_WIDTH: Record<ColumnKey, number> = {
  title: 80,
  bpm: 48,
  key: 56,
  genre: 60,
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
