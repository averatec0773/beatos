import React, { useMemo, useState } from "react";

import { useTrackQueryStore } from "@/stores/track-query";
import { formatChipLabel } from "@/lib/format-chip-label";
import { formatVocabLabel } from "@/data/vocab-label";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { FilterFieldPopover } from "@/components/FilterFieldPopover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type FieldType = "producer" | "genre" | "mood" | "key" | "bpm" | "has_audio";

interface Chip {
  field: FieldType;
  filterKey: string;
  label: string;
}

const FIELD_OPTIONS: { field: FieldType; label: string }[] = [
  { field: "producer", label: "Producer" },
  { field: "genre", label: "Genre" },
  { field: "mood", label: "Mood" },
  { field: "key", label: "Key" },
  { field: "bpm", label: "BPM" },
  { field: "has_audio", label: "Audio" },
];

type PopoverView = "field-list" | FieldType;

export function FilterChipBar({ inline = false }: { inline?: boolean } = {}): React.JSX.Element {
  const filters = useTrackQueryStore((s) => s.filters);
  const clearAllFilters = useTrackQueryStore((s) => s.clearAllFilters);
  const removeFilter = useTrackQueryStore((s) => s.removeFilter);
  const vocabLocale = useVocabLocaleStore((s) => s.locale);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PopoverView>("field-list");

  const chips = useMemo<Chip[]>(() => {
    const result: Chip[] = [];

    if (filters.producers.length > 0) {
      result.push({
        field: "producer",
        filterKey: "producers",
        label: formatChipLabel("Producer", filters.producers),
      });
    }
    if (filters.genres.length > 0) {
      result.push({
        field: "genre",
        filterKey: "genres",
        label: formatChipLabel(
          "Genre",
          filters.genres.map((v) => formatVocabLabel(v, "genre", vocabLocale)),
        ),
      });
    }
    if (filters.moods.length > 0) {
      result.push({
        field: "mood",
        filterKey: "moods",
        label: formatChipLabel(
          "Mood",
          filters.moods.map((v) => formatVocabLabel(v, "mood", vocabLocale)),
        ),
      });
    }
    if (filters.keys.length > 0) {
      result.push({
        field: "key",
        filterKey: "keys",
        label: formatChipLabel("Key", filters.keys),
      });
    }
    if (filters.bpm_min != null || filters.bpm_max != null) {
      const min = filters.bpm_min != null ? String(filters.bpm_min) : "?";
      const max = filters.bpm_max != null ? String(filters.bpm_max) : "?";
      result.push({
        field: "bpm",
        filterKey: "bpm_min",
        label: `BPM · ${min}-${max}`,
      });
    }
    if (filters.has_audio != null) {
      result.push({
        field: "has_audio",
        filterKey: "has_audio",
        label: `Audio · ${filters.has_audio ? "yes" : "no"}`,
      });
    }

    return result;
  }, [filters, vocabLocale]);

  function openFieldPicker() {
    setView("field-list");
    setOpen(true);
  }

  function openChipEditor(field: FieldType) {
    setView(field);
    setOpen(true);
  }

  function closePopover() {
    setOpen(false);
    setView("field-list");
  }

  function handleFieldSelect(field: FieldType) {
    setView(field);
  }

  function handleRemoveChip(chip: Chip, e: React.MouseEvent) {
    e.stopPropagation();
    // For array fields: remove all (no specific value — clear the field)
    // For scalar fields: remove entire field
    removeFilter(chip.filterKey as Parameters<typeof removeFilter>[0]);
    // Also clear the bpm_max when clearing bpm_min
    if (chip.field === "bpm") {
      removeFilter("bpm_max");
    }
  }

  return (
    <div
      className={
        inline
          ? "flex items-center gap-2 flex-wrap"
          : "px-4 py-2 flex items-center gap-2 flex-wrap border-b border-border-subtle bg-bg-base min-h-[40px]"
      }
    >
      {chips.map((chip) => (
        <button
          key={chip.field}
          type="button"
          data-filter-chip
          data-field={chip.filterKey}
          onClick={() => openChipEditor(chip.field)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-accent/15 text-accent text-xs"
        >
          <span>{chip.label}</span>
          <span
            onClick={(e) => handleRemoveChip(chip, e)}
            className="hover:text-text-primary leading-none"
            aria-label={`Remove ${chip.field} filter`}
          >
            ×
          </span>
        </button>
      ))}

      <Popover
        open={open}
        onOpenChange={(o) => {
          if (!o) closePopover();
          else setOpen(true);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            data-add-filter
            onClick={openFieldPicker}
            className="text-xs text-accent hover:underline"
          >
            + Add filter
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3">
          {view === "field-list" ? (
            <div className="flex flex-col gap-0.5">
              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-1 mb-1">
                Filter by
              </div>
              {FIELD_OPTIONS.map((opt) => (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => handleFieldSelect(opt.field)}
                  className="text-left text-sm text-text-secondary hover:text-text-primary hover:bg-bg-row-hover px-2 py-1.5 rounded"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <FilterFieldPopover field={view} onApply={closePopover} onCancel={closePopover} />
          )}
        </PopoverContent>
      </Popover>

      {chips.length > 0 && (
        <button
          type="button"
          onClick={clearAllFilters}
          className={`${inline ? "" : "ml-auto "}text-xs text-text-tertiary hover:text-text-secondary`}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
