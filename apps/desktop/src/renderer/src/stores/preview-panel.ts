import { create } from "zustand";

const STORAGE_KEY = "beatos.previewPanel.v1";

export const PREVIEW_DEFAULT_WIDTH = 360;
export const PREVIEW_MIN_WIDTH = 280;
export const PREVIEW_MAX_WIDTH = 600;

// Below this window width the fixed-width sidebar + detail panel squeeze the
// track table toward unusable, so the detail panel auto-folds to its rail.
export const PREVIEW_AUTO_COLLAPSE_WIDTH = 1024;

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
  // True when the panel was folded by the responsive width rule (not the user),
  // so we know to restore it once there's room again. Not persisted — it's a
  // function of the current viewport, and the saved `open` stays the user's intent.
  autoCollapsed: boolean;
  toggle(): void;
  setOpen(open: boolean): void;
  setWidth(width: number): void;
  applyResponsive(narrow: boolean): void;
}

export const usePreviewPanelStore = create<PreviewPanelState>((set, get) => ({
  ...loadPersisted(),
  autoCollapsed: false,
  toggle() {
    // A manual toggle is the user taking control: clear the auto flag so a later
    // widen doesn't reopen a panel they deliberately closed.
    const open = !get().open;
    persist({ open, width: get().width });
    set({ open, autoCollapsed: false });
  },
  setOpen(open) {
    persist({ open, width: get().width });
    set({ open, autoCollapsed: false });
  },
  setWidth(width) {
    const clamped = Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, width));
    persist({ open: get().open, width: clamped });
    set({ width: clamped });
  },
  applyResponsive(narrow) {
    const { open, autoCollapsed } = get();
    if (narrow && open) {
      // Fold to the rail, but don't persist — keep the saved preference "open"
      // so we can restore it when the window widens again.
      set({ open: false, autoCollapsed: true });
    } else if (!narrow && autoCollapsed) {
      set({ open: true, autoCollapsed: false });
    }
  },
}));
