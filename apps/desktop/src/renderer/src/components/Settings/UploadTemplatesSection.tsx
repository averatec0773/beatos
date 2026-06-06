import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useUploadTemplatesStore } from "@/stores/upload-templates";

export function UploadTemplatesSection(): React.JSX.Element {
  const { t } = useTranslation();
  const templates = useUploadTemplatesStore((s) => s.templates);
  const setField = useUploadTemplatesStore((s) => s.setField);
  const reset = useUploadTemplatesStore((s) => s.reset);
  const hydrate = useUploadTemplatesStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const fields: {
    key: "album_name" | "beat_name" | "beat_description" | "album_description";
    label: string;
    rows: number;
  }[] = [
    { key: "album_name", label: t("uploadTemplates.albumName"), rows: 1 },
    { key: "beat_name", label: t("uploadTemplates.beatName"), rows: 1 },
    { key: "beat_description", label: t("uploadTemplates.beatDesc"), rows: 6 },
    { key: "album_description", label: t("uploadTemplates.albumDesc"), rows: 2 },
  ];

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("uploadTemplates.title")}</h2>
      <p className="text-xs text-text-tertiary mb-3">
        {t("uploadTemplates.desc")}
        <code className="mx-1">
          {"{title} {genre} {year} {publish date} {prod} {bpm} {key} {free}"}
        </code>
      </p>
      <div className="space-y-3">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-sm text-text-secondary">{f.label}</span>
            <textarea
              aria-label={f.label}
              rows={f.rows}
              value={templates[f.key]}
              onChange={(e) => void setField(f.key, e.target.value)}
              className="mt-1 w-full rounded-md bg-bg-elevated p-2 text-sm font-mono"
            />
          </label>
        ))}
        <label className="block">
          <span className="text-sm text-text-secondary">{t("uploadTemplates.producerJoiner")}</span>
          <input
            aria-label={t("uploadTemplates.producerJoiner")}
            value={templates.prod_separator}
            onChange={(e) => void setField("prod_separator", e.target.value)}
            className="mt-1 w-full rounded-md bg-bg-elevated p-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-text-secondary">{t("uploadTemplates.freePrefix")}</span>
          <input
            aria-label={t("uploadTemplates.freePrefixAria")}
            value={templates.free_prefix}
            onChange={(e) => void setField("free_prefix", e.target.value)}
            className="mt-1 w-full rounded-md bg-bg-elevated p-2 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void reset()}
        className="mt-3 rounded px-3 py-1 text-sm text-text-tertiary hover:text-text-secondary bg-bg-elevated"
      >
        {t("uploadTemplates.resetDefaults")}
      </button>
    </section>
  );
}
