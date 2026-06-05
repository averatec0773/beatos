import en from "./locales/en/translation.json";
import zh from "./locales/zh/translation.json";

export const DEFAULT_LANGUAGE: AppLanguage = "en";
export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** app_settings key holding the persisted App-UI language. */
export const APP_LANGUAGE_KEY = "app_language";

/** Language names shown in their own script (never translated). */
export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: "English",
  zh: "中文",
};

export const resources = {
  en: { translation: en },
  zh: { translation: zh },
} as const;
