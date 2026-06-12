import { create } from "zustand";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
  durationMs?: number;
  // Optional inline action (e.g. "Undo"); clicking it dismisses the toast.
  action?: ToastAction;
}

interface ToastState {
  current: Toast | null;
  show(variant: ToastVariant, message: string, durationMs?: number, action?: ToastAction): void;
  dismiss(): void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  show(variant, message, durationMs = 4500, action) {
    const id = nextId++;
    set({ current: { id, variant, message, durationMs, action } });
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
