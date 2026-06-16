import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FacetValue } from "@/api/facets";

export type ChipField = "producers" | "genres" | "moods" | "keys";

interface Props {
  recent: string[];
  topProducers: FacetValue[];
  topGenres: FacetValue[];
  topKeys: FacetValue[];
  recentlyAdded: { id: number; title: string }[];
  onPickQuery(q: string): void;
  onPickChip(field: ChipField, value: string): void;
  onOpenTrack(id: number): void;
  onRemoveRecent(q: string): void;
  onClearRecent(): void;
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-2 pt-2 pb-1 text-xs font-medium text-text-tertiary uppercase tracking-wide">
      {children}
    </div>
  );
}

export function SearchDropdown({
  recent,
  topProducers,
  topGenres,
  topKeys,
  recentlyAdded,
  onPickQuery,
  onPickChip,
  onOpenTrack,
  onRemoveRecent,
  onClearRecent,
}: Props): React.JSX.Element | null {
  const { t } = useTranslation();
  const hasFacets = topProducers.length > 0 || topGenres.length > 0 || topKeys.length > 0;
  const hasAnything = recent.length > 0 || hasFacets || recentlyAdded.length > 0;

  if (!hasAnything) return null;

  return (
    <div
      role="listbox"
      aria-label={t("search.suggestions")}
      className="absolute left-0 right-0 top-full mt-1 z-50 max-h-96 overflow-y-auto rounded-md border border-border-subtle bg-bg-elevated p-1 shadow-lg"
    >
      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-2 pt-2 pb-1">
            <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              {t("search.recentSearches")}
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClearRecent}
              className="rounded px-1 text-xs text-text-tertiary hover:text-text-primary"
            >
              {t("search.clearRecent")}
            </button>
          </div>
          {recent.map((r) => (
            <div key={r} className="group flex items-center rounded-md hover:bg-bg-row-hover">
              <button
                type="button"
                onClick={() => onPickQuery(r)}
                className="block min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm text-text-secondary group-hover:text-text-primary"
              >
                {r}
              </button>
              <button
                type="button"
                aria-label={t("search.removeRecent")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onRemoveRecent(r)}
                className="mr-1 shrink-0 rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-bg-elevated hover:text-text-primary group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {hasFacets && (
        <div>
          {topProducers.length > 0 && (
            <>
              <SectionLabel>{t("search.topProducers")}</SectionLabel>
              <div className="flex flex-wrap gap-1 px-2 pb-1">
                {topProducers.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => onPickChip("producers", f.value)}
                    className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-sm text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
                  >
                    {f.value}
                  </button>
                ))}
              </div>
            </>
          )}
          {topGenres.length > 0 && (
            <>
              <SectionLabel>{t("search.topGenres")}</SectionLabel>
              <div className="flex flex-wrap gap-1 px-2 pb-1">
                {topGenres.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => onPickChip("genres", f.value)}
                    className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-sm text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
                  >
                    {f.value}
                  </button>
                ))}
              </div>
            </>
          )}
          {topKeys.length > 0 && (
            <>
              <SectionLabel>{t("search.topKeys")}</SectionLabel>
              <div className="flex flex-wrap gap-1 px-2 pb-1">
                {topKeys.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => onPickChip("keys", f.value)}
                    className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-sm text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
                  >
                    {f.value}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {recentlyAdded.length > 0 && (
        <div>
          <SectionLabel>{t("search.recentlyAdded")}</SectionLabel>
          {recentlyAdded.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenTrack(t.id)}
              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
