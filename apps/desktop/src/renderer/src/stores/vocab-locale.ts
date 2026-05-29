import { create } from "zustand";

import { appSettings } from "@/api/app-settings";
import type { VocabLocale } from "@/data/vocab-label";

const KEY = "vocab_locale";

interface VocabLocaleState {
  locale: VocabLocale;
  hydrate(): Promise<void>;
  setLocale(v: VocabLocale): Promise<void>;
}

export const useVocabLocaleStore = create<VocabLocaleState>((set) => ({
  locale: "both",
  async hydrate() {
    try {
      const r = await appSettings.get<VocabLocale>(KEY);
      if (r.value === "both" || r.value === "zh" || r.value === "en") {
        set({ locale: r.value });
      }
    } catch (e) {
      console.warn("[vocab-locale] hydrate failed", e);
    }
  },
  async setLocale(v) {
    set({ locale: v }); // optimistic — UI updates immediately
    try {
      await appSettings.set<VocabLocale>(KEY, v);
    } catch (e) {
      console.error("[vocab-locale] persist failed", e);
    }
  },
}));
