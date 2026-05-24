import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** Preset options (e.g., MP3 / WAV / Stems). Extras from `value` not in
   *  this list are still rendered and toggleable. */
  presetOptions: readonly Option[];
  placeholder?: string;
  className?: string;
}

/**
 * Compact trigger + popover for picking a tier's deliverables — purpose-built
 * for the single-row license layout where the chip cluster from
 * ChipMultiSelect would push other cells off-screen. Renders a select-like
 * button showing the current selection ("MP3 + WAV") or the placeholder;
 * popover lets the user toggle presets and type custom values (e.g.,
 * "midi", "project_file") that propagate back as plain strings.
 */
export function DeliverablesPicker({
  value,
  onChange,
  presetOptions,
  placeholder = "Select…",
  className,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Union of presets + any custom values already present on this tier, so
  // the popover lists everything the user has previously chosen here.
  const presetValues = new Set(presetOptions.map((o) => o.value));
  const customExtras = value.filter((v) => !presetValues.has(v));
  const allOptions: Option[] = [
    ...presetOptions,
    ...customExtras.map((v) => ({ value: v, label: v })),
  ];

  function toggle(v: string): void {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  function commitCustom(): void {
    const v = customInput.trim().toLowerCase();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setCustomInput("");
  }

  const label =
    value.length === 0
      ? placeholder
      : value.map((v) => v.toUpperCase()).join(" + ");

  useEffect(() => {
    if (!open) return;
    // Defer focus so radix Popover has time to mount the content node.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm hover:bg-bg-row-hover min-w-0 ${
            className ?? ""
          }`}
          data-deliverables-trigger
        >
          <span
            className={`truncate ${value.length === 0 ? "text-text-tertiary" : "text-text-primary"}`}
          >
            {label}
          </span>
          <ChevronDown size={14} className="text-text-tertiary shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="p-1 w-56">
        <div className="max-h-64 overflow-y-auto">
          {allOptions.map((opt) => {
            const selected = value.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg-row-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(opt.value)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            );
          })}
        </div>
        <div className="border-t border-border-subtle mt-1 pt-2 px-1">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
                }
              }}
              placeholder="Custom (e.g. midi)"
              className="min-w-0 flex-1 rounded border border-border-subtle bg-bg-base px-2 py-1 text-xs focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={commitCustom}
              disabled={customInput.trim() === ""}
              className="rounded p-1 text-text-secondary hover:bg-bg-row-hover disabled:opacity-40"
              aria-label="Add custom deliverable"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
