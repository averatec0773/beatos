import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  open(options: ConfirmOptions): Promise<boolean>;
  respond(ok: boolean): void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  open(options) {
    // If a confirm is already open, resolve it false before replacing it.
    const prev = get().current;
    if (prev) prev.resolve(false);
    return new Promise<boolean>((resolve) => {
      set({ current: { ...options, resolve } });
    });
  },
  respond(ok) {
    const cur = get().current;
    if (!cur) return;
    cur.resolve(ok);
    set({ current: null });
  },
}));

/**
 * Styled, promise-based replacement for the native `confirm()`. Resolves true on
 * confirm, false on cancel / dismiss. Rendered by the single <ConfirmDialog/>
 * host mounted in AppShell.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(options);
}
