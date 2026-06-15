/**
 * Appearance preferences (the ambient backdrop + panel translucency). Unlike
 * the session-scoped panel stores, these are genuine user preferences, so they
 * persist across restarts via localStorage.
 */

import { create } from "zustand";

const STORAGE_KEY = "beatos.appearance.v1";

export const BACKDROP_INTENSITY_MIN = 0;
export const BACKDROP_INTENSITY_MAX = 100;
export const BACKDROP_SPEED_MIN = 0;
export const BACKDROP_SPEED_MAX = 20;

// Fresh-install defaults — a calm, subtle look (the dialed-in baseline). The
// CSS fallbacks in main.css (--card-alpha / --card-blur) mirror these so the
// first paint matches before AppShell's effect runs. Intensity/speed apply to
// the ASCII style only.
export const BACKDROP_INTENSITY_DEFAULT = 24;
export const BACKDROP_SPEED_DEFAULT = 4;

// Panel (card) opacity, 0–100 → `--card-alpha` = value / 100. 0 = fully
// see-through panels (text floats on the backdrop). Default mirrors main.css.
export const CARD_OPACITY_MIN = 0;
export const CARD_OPACITY_MAX = 100;
export const CARD_OPACITY_DEFAULT = 24;

// Which ambient backdrop renders behind the floating cards:
//   "aurora" — the Unicorn Studio WebGL field (default on fresh installs)
//   "ascii"  — the original CPU glyph-rain
//   "off"    — paint nothing (the dark app base shows through)
export type BackdropStyle = "aurora" | "ascii" | "off";
export const BACKDROP_STYLES: readonly BackdropStyle[] = ["aurora", "ascii", "off"];
export const BACKDROP_STYLE_DEFAULT: BackdropStyle = "aurora";

interface Persisted {
  backdropStyle: BackdropStyle;
  backdropIntensity: number; // 0–100 → ASCII backdrop peak alpha is intensity / 100
  backdropSpeed: number; // 0–20, 7 = the original rain cadence
  cardOpacity: number; // 0–100 → --card-alpha
}

const DEFAULTS: Persisted = {
  backdropStyle: BACKDROP_STYLE_DEFAULT,
  backdropIntensity: BACKDROP_INTENSITY_DEFAULT,
  backdropSpeed: BACKDROP_SPEED_DEFAULT,
  cardOpacity: CARD_OPACITY_DEFAULT,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS }; // fresh install → aurora
    const p = JSON.parse(raw) as Partial<Persisted> & { backdropEnabled?: boolean };
    // Migrate the pre-aurora schema: existing installs stored a boolean toggle
    // over the ASCII rain. Aurora is the new default, so anyone who had the
    // backdrop ON (or never touched it) adopts it; only an explicit OFF is
    // preserved. Users who prefer the old rain can re-pick ASCII in Settings.
    const backdropStyle: BackdropStyle =
      typeof p.backdropStyle === "string" &&
      (BACKDROP_STYLES as readonly string[]).includes(p.backdropStyle)
        ? (p.backdropStyle as BackdropStyle)
        : p.backdropEnabled === false
          ? "off"
          : DEFAULTS.backdropStyle;
    return {
      backdropStyle,
      backdropIntensity:
        typeof p.backdropIntensity === "number" && Number.isFinite(p.backdropIntensity)
          ? clamp(p.backdropIntensity, BACKDROP_INTENSITY_MIN, BACKDROP_INTENSITY_MAX)
          : DEFAULTS.backdropIntensity,
      backdropSpeed:
        typeof p.backdropSpeed === "number" && Number.isFinite(p.backdropSpeed)
          ? clamp(p.backdropSpeed, BACKDROP_SPEED_MIN, BACKDROP_SPEED_MAX)
          : DEFAULTS.backdropSpeed,
      cardOpacity:
        typeof p.cardOpacity === "number" && Number.isFinite(p.cardOpacity)
          ? clamp(p.cardOpacity, CARD_OPACITY_MIN, CARD_OPACITY_MAX)
          : DEFAULTS.cardOpacity,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage unavailable (tests / SSR) — fine */
  }
}

interface AppearanceState extends Persisted {
  setBackdropStyle(style: BackdropStyle): void;
  setBackdropIntensity(intensity: number): void;
  setBackdropSpeed(speed: number): void;
  setCardOpacity(opacity: number): void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...loadPersisted(),
  setBackdropStyle(backdropStyle) {
    set({ backdropStyle });
    persist({ ...get(), backdropStyle });
  },
  setBackdropIntensity(intensity) {
    const backdropIntensity = clamp(intensity, BACKDROP_INTENSITY_MIN, BACKDROP_INTENSITY_MAX);
    set({ backdropIntensity });
    persist({ ...get(), backdropIntensity });
  },
  setBackdropSpeed(speed) {
    const backdropSpeed = clamp(speed, BACKDROP_SPEED_MIN, BACKDROP_SPEED_MAX);
    set({ backdropSpeed });
    persist({ ...get(), backdropSpeed });
  },
  setCardOpacity(opacity) {
    const cardOpacity = clamp(opacity, CARD_OPACITY_MIN, CARD_OPACITY_MAX);
    set({ cardOpacity });
    persist({ ...get(), cardOpacity });
  },
}));
