import React from "react";
import { useTranslation } from "react-i18next";

import { useAppLanguageStore } from "@/stores/app-language";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n/resources";

export function LanguageSection(): React.JSX.Element {
  const { t } = useTranslation();
  const language = useAppLanguageStore((s) => s.language);
  const setLanguage = useAppLanguageStore((s) => s.setLanguage);

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("settings.language.title")}</h2>
      <p className="text-xs text-text-tertiary mb-3">{t("settings.language.desc")}</p>
      <div className="inline-flex gap-1 rounded-md bg-bg-elevated p-1">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <button
            key={lng}
            type="button"
            aria-pressed={language === lng}
            onClick={() => void setLanguage(lng)}
            className={`rounded px-3 py-1 text-sm ${
              language === lng
                ? "bg-accent/20 text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {LANGUAGE_LABELS[lng]}
          </button>
        ))}
      </div>
    </section>
  );
}
