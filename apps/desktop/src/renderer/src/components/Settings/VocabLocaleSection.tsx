import React from "react";

import { useVocabLocaleStore } from "@/stores/vocab-locale";
import type { VocabLocale } from "@/data/vocab-label";

const OPTIONS: { value: VocabLocale; label: string }[] = [
  { value: "both", label: "中文 (English)" },
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export function VocabLocaleSection(): React.JSX.Element {
  const locale = useVocabLocaleStore((s) => s.locale);
  const setLocale = useVocabLocaleStore((s) => s.setLocale);

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Genre / Mood Language</h2>
      <p className="text-xs text-text-tertiary mb-3">
        Display language for genre and mood options across the editor, filters, and track list.
        Stored values are unaffected.
      </p>
      <div className="inline-flex gap-1 rounded-md bg-bg-elevated p-1">
        {OPTIONS.map((opt) => (
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
