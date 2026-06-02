/**
 * Sidebar width persistence (mirrors `preview-panel.ts`).
 *
 * The sidebar is always visible (no close toggle — it's primary nav) but the
 * user can drag its right edge to widen it. Width persists in sessionStorage
 * so a remount inside one app session keeps the user's choice; explicit
 * sessionStorage (not localStorage) matches preview-panel — across-app-restart
 * persistence is a separate v0.0.X candidate if anyone asks.
 */

import { create } from "zustand";

const STORAGE_KEY = "beatos.sidebarPanel.v1";

export const SIDEBAR_DEFAULT_WIDTH = 220;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 360;
/** Width of the icon-only collapsed rail (one 52px cover + side padding). */
export const SIDEBAR_COLLAPSED_WIDTH = 76;

interface Persisted {
  width: number;
  collapsed: boolean;
}

function loadPersisted(): Persisted {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      width:
        typeof parsed.width === "number" && Number.isFinite(parsed.width)
          ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed.width))
          : SIDEBAR_DEFAULT_WIDTH,
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
  }
}

function persist(state: Persisted): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable (tests / SSR) — fine */
  }
}

interface SidebarPanelState extends Persisted {
  setWidth(width: number): void;
  toggleCollapsed(): void;
}

export const useSidebarPanelStore = create<SidebarPanelState>((set, get) => ({
  ...loadPersisted(),
  setWidth(width) {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
    persist({ width: clamped, collapsed: get().collapsed });
    set({ width: clamped });
  },
  toggleCollapsed() {
    const collapsed = !get().collapsed;
    persist({ width: get().width, collapsed });
    set({ collapsed });
  },
}));
