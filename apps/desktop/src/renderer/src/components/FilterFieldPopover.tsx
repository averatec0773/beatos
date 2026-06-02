import React, { useEffect, useState } from "react";

import { distinct } from "@/api/distinct";
import { formatVocabLabel } from "@/data/vocab-label";
import { useTrackQueryStore } from "@/stores/track-query";
import { useVocabLocaleStore } from "@/stores/vocab-locale";

type MultiField = "producer" | "genre" | "mood" | "key";
type FieldType = MultiField | "bpm" | "has_audio";

interface Props {
  field: FieldType;
  onApply: () => void;
  onCancel: () => void;
}

const FIELD_LABELS: Record<FieldType, string> = {
  producer: "Producer",
  genre: "Genre",
  mood: "Mood",
  key: "Key",
  bpm: "BPM",
  has_audio: "Audio",
};

function toDistinctField(field: MultiField): "producer" | "genre" | "mood" | "key_signature" {
  return field === "key" ? "key_signature" : field;
}

function MultiValuePicker({
  field,
  onApply,
  onCancel,
}: {
  field: MultiField;
  onApply: () => void;
  onCancel: () => void;
}) {
  const filters = useTrackQueryStore((s) => s.filters);
  const setProducerFilter = useTrackQueryStore((s) => s.setProducerFilter);
  const setGenreFilter = useTrackQueryStore((s) => s.setGenreFilter);
  const setMoodFilter = useTrackQueryStore((s) => s.setMoodFilter);
  const setKeyFilter = useTrackQueryStore((s) => s.setKeyFilter);
  const vocabLocale = useVocabLocaleStore((s) => s.locale);

  function displayLabel(val: string): string {
    if (field === "genre") return formatVocabLabel(val, "genre", vocabLocale);
    if (field === "mood") return formatVocabLabel(val, "mood", vocabLocale);
    return val; // producer / key render raw
  }

  const currentValues: string[] =
    field === "producer"
      ? filters.producers
      : field === "genre"
        ? filters.genres
        : field === "mood"
          ? filters.moods
          : filters.keys;

  const [selected, setSelected] = useState<Set<string>>(new Set(currentValues));
  const [values, setValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    distinct
      .values(toDistinctField(field))
      .then((vals) => {
        setValues(vals);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [field]);

  function toggle(val: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }

  function apply() {
    const arr = Array.from(selected);
    if (field === "producer") setProducerFilter(arr);
    else if (field === "genre") setGenreFilter(arr);
    else if (field === "mood") setMoodFilter(arr);
    else setKeyFilter(arr);
    onApply();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-1">
        {FIELD_LABELS[field]}
      </div>
      <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
        {loading && <span className="text-xs text-text-tertiary px-1 py-1">Loading…</span>}
        {error && <span className="text-xs text-text-tertiary px-1 py-1">Failed to load</span>}
        {!loading && !error && values.length === 0 && (
          <span className="text-xs text-text-tertiary px-1 py-1">No values found</span>
        )}
        {!loading &&
          !error &&
          values.map((val) => (
            <label
              key={val}
              className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-bg-row-hover text-sm text-text-secondary"
            >
              <input
                type="checkbox"
                checked={selected.has(val)}
                onChange={() => toggle(val)}
                className="accent-accent"
              />
              <span className="truncate">{displayLabel(val)}</span>
            </label>
          ))}
      </div>
      <div className="flex gap-2 justify-end pt-1 border-t border-border-subtle">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded btn-primary"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function BpmPicker({ onApply, onCancel }: { onApply: () => void; onCancel: () => void }) {
  const filters = useTrackQueryStore((s) => s.filters);
  const setBpmRange = useTrackQueryStore((s) => s.setBpmRange);

  const [minVal, setMinVal] = useState(filters.bpm_min != null ? String(filters.bpm_min) : "");
  const [maxVal, setMaxVal] = useState(filters.bpm_max != null ? String(filters.bpm_max) : "");

  function apply() {
    const min = minVal.trim() === "" ? null : Number(minVal);
    const max = maxVal.trim() === "" ? null : Number(maxVal);
    setBpmRange(min, max);
    onApply();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-1">
        BPM Range
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Min"
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          className="w-20 px-2 py-1 text-sm rounded border border-border-subtle bg-bg-base text-text-primary focus:outline-none focus:border-accent"
        />
        <span className="text-text-tertiary text-sm">–</span>
        <input
          type="number"
          placeholder="Max"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          className="w-20 px-2 py-1 text-sm rounded border border-border-subtle bg-bg-base text-text-primary focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex gap-2 justify-end pt-1 border-t border-border-subtle">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded btn-primary"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

type HasAudioValue = boolean | null;

function HasAudioPicker({ onApply, onCancel }: { onApply: () => void; onCancel: () => void }) {
  const filters = useTrackQueryStore((s) => s.filters);
  const setHasAudio = useTrackQueryStore((s) => s.setHasAudio);

  const [value, setValue] = useState<HasAudioValue>(filters.has_audio);

  function apply() {
    setHasAudio(value);
    onApply();
  }

  const options: { label: string; val: HasAudioValue }[] = [
    { label: "Any", val: null },
    { label: "Yes", val: true },
    { label: "No", val: false },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-1">
        Has Audio
      </div>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <label
            key={String(opt.val)}
            className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-bg-row-hover text-sm text-text-secondary"
          >
            <input
              type="radio"
              checked={value === opt.val}
              onChange={() => setValue(opt.val)}
              className="accent-accent"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-1 border-t border-border-subtle">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded btn-primary"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export function FilterFieldPopover({ field, onApply, onCancel }: Props): React.JSX.Element {
  if (field === "bpm") {
    return <BpmPicker onApply={onApply} onCancel={onCancel} />;
  }
  if (field === "has_audio") {
    return <HasAudioPicker onApply={onApply} onCancel={onCancel} />;
  }
  return <MultiValuePicker field={field} onApply={onApply} onCancel={onCancel} />;
}
