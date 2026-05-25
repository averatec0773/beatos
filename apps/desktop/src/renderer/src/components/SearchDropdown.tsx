import React from "react";

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
}: Props): React.JSX.Element | null {
  const hasFacets = topProducers.length > 0 || topGenres.length > 0 || topKeys.length > 0;
  const hasAnything = recent.length > 0 || hasFacets || recentlyAdded.length > 0;

  if (!hasAnything) return null;

  return (
    <div
      role="listbox"
      aria-label="Search suggestions"
      className="absolute left-0 right-0 top-full mt-1 z-50 max-h-96 overflow-y-auto rounded-md border border-border-subtle bg-bg-elevated p-1 shadow-lg"
    >
      {recent.length > 0 && (
        <div>
          <SectionLabel>Recent searches</SectionLabel>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onPickQuery(r)}
              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {hasFacets && (
        <div>
          {topProducers.length > 0 && (
            <>
              <SectionLabel>Top producers</SectionLabel>
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
              <SectionLabel>Top genres</SectionLabel>
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
              <SectionLabel>Top keys</SectionLabel>
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
          <SectionLabel>Recently added</SectionLabel>
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
