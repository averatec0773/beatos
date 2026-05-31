import React, { useEffect } from "react";

import { useUploadTemplatesStore } from "@/stores/upload-templates";

const FIELDS: { key: "album_name" | "beat_name" | "beat_description" | "album_description"; label: string; rows: number }[] = [
  { key: "album_name", label: "专辑名模板", rows: 1 },
  { key: "beat_name", label: "Beat 名称模板", rows: 1 },
  { key: "beat_description", label: "Beat 说明模板", rows: 6 },
  { key: "album_description", label: "专辑描述模板", rows: 2 },
];

export function UploadTemplatesSection(): React.JSX.Element {
  const templates = useUploadTemplatesStore((s) => s.templates);
  const setField = useUploadTemplatesStore((s) => s.setField);
  const reset = useUploadTemplatesStore((s) => s.reset);
  const hydrate = useUploadTemplatesStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">上传模板</h2>
      <p className="text-xs text-text-tertiary mb-3">
        发送到平台上传页时,用这些模板生成专辑名 / Beat 名称 / Beat 说明。占位符:
        <code className="mx-1">{"{title} {genre} {year} {publish date} {prod} {bpm} {key} {free}"}</code>
      </p>
      <div className="space-y-3">
        {FIELDS.map((f) => (
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
          <span className="text-sm text-text-secondary">制作人连接符</span>
          <input
            aria-label="制作人连接符"
            value={templates.prod_separator}
            onChange={(e) => void setField("prod_separator", e.target.value)}
            className="mt-1 w-full rounded-md bg-bg-elevated p-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-text-secondary">免费前缀(仅免费 track 的 {"{free}"} 处生成)</span>
          <input
            aria-label="免费前缀"
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
        重置默认
      </button>
    </section>
  );
}
