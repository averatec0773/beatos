import { create } from "zustand";

export interface FileFilter {
  name: string;
  extensions: string[];
}

export type FileBrowserMode = "file" | "folder";

interface FileBrowserState {
  open: boolean;
  mode: FileBrowserMode;
  filters: FileFilter[];
  /** Resolver for the in-flight request; null when idle. */
  _resolve: ((path: string | null) => void) | null;
  /** Open the browser and resolve with the chosen absolute path (or null). */
  request: (mode: FileBrowserMode, filters?: FileFilter[]) => Promise<string | null>;
  select: (path: string) => void;
  cancel: () => void;
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  open: false,
  mode: "file",
  filters: [],
  _resolve: null,
  request: (mode, filters = []) =>
    new Promise<string | null>((resolve) => {
      get()._resolve?.(null); // resolve any in-flight request before replacing
      set({ open: true, mode, filters, _resolve: resolve });
    }),
  select: (path) => {
    get()._resolve?.(path);
    set({ open: false, _resolve: null });
  },
  cancel: () => {
    get()._resolve?.(null);
    set({ open: false, _resolve: null });
  },
}));
