import { useState } from "react";
import { parseKey, formatKey, type KeyMode } from "@/lib/parse-key";

const FLAT_ROW_1 = ["Db", "Eb", null, "Gb", "Ab", "Bb"] as const;
const SHARP_ROW_1 = ["C#", "D#", null, "F#", "G#", "A#"] as const;
const NATURALS = ["C", "D", "E", "F", "G", "A", "B"] as const;

type Tab = "flat" | "sharp";

interface Props {
  initialValue: string | null;
  onCommit: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function inferTab(note: string | null): Tab {
  if (note && note.includes("#")) return "sharp";
  return "flat";
}

export function KeyPickerPopover({ initialValue, onCommit, onClear, onClose }: Props) {
  const seed = parseKey(initialValue);
  const [tab, setTab] = useState<Tab>(inferTab(seed?.note ?? null));
  const [note, setNote] = useState<string | null>(seed?.note ?? null);
  const [mode, setMode] = useState<KeyMode | null>(seed?.mode ?? null);

  const handleClose = () => {
    if (note && mode) onCommit(formatKey(note, mode));
    onClose();
  };
  const handleClear = () => {
    onClear();
    onClose();
  };

  const row1 = tab === "flat" ? FLAT_ROW_1 : SHARP_ROW_1;

  return (
    <div className="w-[360px] bg-bg-elevated p-4 rounded-md text-text-primary">
      <div className="flex border-b border-border-subtle mb-4">
        <button
          type="button"
          onClick={() => setTab("flat")}
          className={`flex-1 pb-2 text-sm ${tab === "flat" ? "border-b-2 border-accent" : "text-text-tertiary"}`}
        >
          Flat keys
        </button>
        <button
          type="button"
          onClick={() => setTab("sharp")}
          className={`flex-1 pb-2 text-sm ${tab === "sharp" ? "border-b-2 border-accent" : "text-text-tertiary"}`}
        >
          Sharp keys
        </button>
      </div>

      <div className="flex justify-center gap-2 mb-2">
        {row1.map((n, i) =>
          n === null ? (
            <div key={`gap-${i}`} className="w-10" />
          ) : (
            <button
              key={n}
              type="button"
              aria-label={n}
              data-selected={note === n ? "true" : "false"}
              onClick={() => setNote(n)}
              className={`w-10 h-10 rounded-md border ${note === n ? "border-accent bg-accent/15" : "border-border-subtle hover:bg-bg-row-hover"}`}
            >
              {n}
            </button>
          ),
        )}
      </div>

      <div className="flex justify-center gap-2 mb-4">
        {NATURALS.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={n}
            data-selected={note === n ? "true" : "false"}
            onClick={() => setNote(n)}
            className={`w-10 h-10 rounded-md border ${note === n ? "border-accent bg-accent/15" : "border-border-subtle hover:bg-bg-row-hover"}`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          aria-label="Major"
          data-selected={mode === "major" ? "true" : "false"}
          onClick={() => setMode("major")}
          className={`flex-1 h-10 rounded-md border ${mode === "major" ? "border-accent bg-accent/15" : "border-border-subtle hover:bg-bg-row-hover"}`}
        >
          Major
        </button>
        <button
          type="button"
          aria-label="Minor"
          data-selected={mode === "minor" ? "true" : "false"}
          onClick={() => setMode("minor")}
          className={`flex-1 h-10 rounded-md border ${mode === "minor" ? "border-accent bg-accent/15" : "border-border-subtle hover:bg-bg-row-hover"}`}
        >
          Minor
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle pt-3">
        <button
          type="button"
          aria-label="Clear"
          onClick={handleClear}
          className="text-sm text-text-tertiary hover:underline"
        >
          Clear
        </button>
        <button
          type="button"
          aria-label="Save"
          onClick={handleClose}
          className="px-4 py-1.5 rounded-md text-sm font-medium btn-primary"
        >
          Save
        </button>
      </div>
    </div>
  );
}
