import { create } from "zustand";
import type { Source } from "@/api/sources";

interface OutOfSourceRequest {
  filePath: string;
  availableSources: Source[];
  onResolved: (resolvedPath: string) => void;
}

interface DialogState {
  outOfSource: OutOfSourceRequest | null;
  openOutOfSource: (req: OutOfSourceRequest) => void;
  closeOutOfSource: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  outOfSource: null,
  openOutOfSource: (req) => set({ outOfSource: req }),
  closeOutOfSource: () => set({ outOfSource: null }),
}));
