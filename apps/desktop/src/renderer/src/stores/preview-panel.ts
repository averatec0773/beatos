import { create } from "zustand";

const STORAGE_KEY = "beatos.previewPanel.v1";

export const PREVIEW_DEFAULT_WIDTH = 360;
export const PREVIEW_MIN_WIDTH = 280;
export const PREVIEW_MAX_WIDTH = 600;

interface Persisted {
  open: boolean;
  width: number;
}

function loadPersisted(): Persisted {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { open: true, width: PREVIEW_DEFAULT_WIDTH };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : true,
      width:
        typeof parsed.width === "number" && Number.isFinite(parsed.width)
          ? Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, parsed.width))
          : PREVIEW_DEFAULT_WIDTH,
    };
  } catch {
    return { open: true, width: PREVIEW_DEFAULT_WIDTH };
  }
}

function persist(state: Persisted): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable (tests / SSR) — fine */
  }
}

interface PreviewPanelState extends Persisted {
  toggle(): void;
  setOpen(open: boolean): void;
  setWidth(width: number): void;
}

export const usePreviewPanelStore = create<PreviewPanelState>((set, get) => ({
  ...loadPersisted(),
  toggle() {
    const next = { ...get(), open: !get().open };
    persist({ open: next.open, width: next.width });
    set({ open: next.open });
  },
  setOpen(open) {
    persist({ open, width: get().width });
    set({ open });
  },
  setWidth(width) {
    const clamped = Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, width));
    persist({ open: get().open, width: clamped });
    set({ width: clamped });
  },
}));
