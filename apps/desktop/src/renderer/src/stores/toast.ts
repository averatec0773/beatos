import { create } from "zustand";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
  durationMs?: number;
}

interface ToastState {
  current: Toast | null;
  show(variant: ToastVariant, message: string, durationMs?: number): void;
  dismiss(): void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  show(variant, message, durationMs = 4500) {
    const id = nextId++;
    set({ current: { id, variant, message, durationMs } });
    if (durationMs > 0) {
      window.setTimeout(() => {
        if (get().current?.id === id) set({ current: null });
      }, durationMs);
    }
  },
  dismiss() {
    set({ current: null });
  },
}));
