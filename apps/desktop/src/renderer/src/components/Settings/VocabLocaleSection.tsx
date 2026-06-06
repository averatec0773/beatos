import React from "react";
import { useTranslation } from "react-i18next";

import { useVocabLocaleStore } from "@/stores/vocab-locale";
import type { VocabLocale } from "@/data/vocab-label";
import { LANGUAGE_LABELS } from "@/i18n/resources";

export function VocabLocaleSection(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useVocabLocaleStore((s) => s.locale);
  const setLocale = useVocabLocaleStore((s) => s.setLocale);

  const options: { value: VocabLocale; label: string }[] = [
    { value: "en", label: LANGUAGE_LABELS.en },
    { value: "zh", label: LANGUAGE_LABELS.zh },
    { value: "both", label: t("settings.tagDisplay.bilingual") },
  ];

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("settings.tagDisplay.title")}</h2>
      <p className="text-xs text-text-tertiary mb-3">{t("settings.tagDisplay.desc")}</p>
      <div className="inline-flex gap-1 rounded-md bg-bg-elevated p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={locale === opt.value}
            onClick={() => void setLocale(opt.value)}
            className={`rounded px-3 py-1 text-sm ${
              locale === opt.value
                ? "bg-accent/20 text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
