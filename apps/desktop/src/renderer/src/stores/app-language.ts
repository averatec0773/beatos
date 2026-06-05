import { create } from "zustand";

import { appSettings } from "@/api/app-settings";
import i18n from "@/i18n";
import {
  APP_LANGUAGE_KEY,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "@/i18n/resources";

function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

function apply(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

interface AppLanguageState {
  language: AppLanguage;
  hydrate(): Promise<void>;
  setLanguage(v: AppLanguage): Promise<void>;
}

export const useAppLanguageStore = create<AppLanguageState>((set) => ({
  language: DEFAULT_LANGUAGE,
  async hydrate() {
    try {
      const r = await appSettings.get<AppLanguage>(APP_LANGUAGE_KEY);
      if (isAppLanguage(r.value)) {
        set({ language: r.value });
        apply(r.value);
        return;
      }
    } catch (e) {
      console.warn("[app-language] hydrate failed", e);
    }
    // Invalid/absent persisted value (incl. first-boot null): reset BOTH the
    // store and i18next so they never disagree (no split-brain).
    set({ language: DEFAULT_LANGUAGE });
    apply(DEFAULT_LANGUAGE);
  },
  async setLanguage(v) {
    set({ language: v }); // optimistic — UI updates immediately
    apply(v);
    try {
      await appSettings.set<AppLanguage>(APP_LANGUAGE_KEY, v);
    } catch (e) {
      console.error("[app-language] persist failed", e);
    }
  },
}));
