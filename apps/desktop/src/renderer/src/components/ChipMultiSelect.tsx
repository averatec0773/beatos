import React, { useState, useRef } from "react";
import { X, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  value: string[];
  options: readonly Option[];
  onChange: (next: string[]) => void;
  allowCustomAdd?: boolean;
  placeholder?: string;
  popoverTitle?: string;
}

export function ChipMultiSelect({
  value,
  options,
  onChange,
  allowCustomAdd = false,
  placeholder,
  popoverTitle,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [customInput, setCustomInput] = useState("");
  const [customOptions, setCustomOptions] = useState<Option[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function openPopover(): void {
    setDraft(value);
    setCustomInput("");
    setOpen(true);
  }

  function handleApply(): void {
    onChange(draft);
    setOpen(false);
  }

  function handleCancel(): void {
    setDraft(value);
    setCustomInput("");
    setOpen(false);
  }

  function handleOpenChange(next: boolean): void {
    if (!next) {
      handleCancel();
    }
  }

  function removeChip(v: string): void {
    onChange(value.filter((x) => x !== v));
  }

  function toggleOption(v: string): void {
    setDraft((cur) =>
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    );
  }

  function handleCustomAdd(): void {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!draft.includes(trimmed)) {
      setDraft((cur) => [...cur, trimmed]);
    }
    if (!customOptions.some((o) => o.value === trimmed) && !options.some((o) => o.value === trimmed)) {
      setCustomOptions((cur) => [...cur, { value: trimmed, label: trimmed }]);
    }
    setCustomInput("");
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomAdd();
    }
  }

  const allOptions: readonly Option[] = [...options, ...customOptions];

  const groups = allOptions.some((o) => o.group)
    ? [...new Set(allOptions.map((o) => o.group ?? ""))]
    : null;

  function getLabel(v: string): string {
    const opt = allOptions.find((o) => o.value === v);
    return opt ? opt.label : v;
  }

  return (
    <div data-chip-multiselect className="flex flex-wrap items-center gap-1.5">
      {value.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-medium text-text-primary"
        >
          {getLabel(v)}
          <button
            type="button"
            aria-label={`Remove ${getLabel(v)}`}
            onClick={() => removeChip(v)}
            className="rounded-full p-0.5 hover:bg-accent/30 focus:outline-none"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-add-button
            onClick={openPopover}
            className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2.5 py-0.5 text-xs text-text-tertiary hover:bg-bg-elevated hover:text-text-primary focus:outline-none"
          >
            <Plus className="h-3 w-3" />
            {placeholder ?? "Add"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="flex flex-col">
            {popoverTitle && (
              <div className="border-b border-border-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {popoverTitle}
              </div>
            )}

            <div className="max-h-52 overflow-y-auto py-1">
              {groups
                ? groups.map((group) => (
                    <div key={group}>
                      {group && (
                        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                          {group}
                        </div>
                      )}
                      {allOptions
                        .filter((o) => (o.group ?? "") === group)
                        .map((opt) => (
                          <label
                            key={opt.value}
                            className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-bg-row-hover"
                          >
                            <input
                              type="checkbox"
                              checked={draft.includes(opt.value)}
                              onChange={() => toggleOption(opt.value)}
                              className="h-3.5 w-3.5 accent-accent"
                            />
                            <span className="truncate">{opt.label}</span>
                          </label>
                        ))}
                    </div>
                  ))
                : allOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-bg-row-hover"
                    >
                      <input
                        type="checkbox"
                        checked={draft.includes(opt.value)}
                        onChange={() => toggleOption(opt.value)}
                        className="h-3.5 w-3.5 accent-accent"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  ))}
            </div>

            {allowCustomAdd && (
              <div className="border-t border-border-subtle p-2">
                <div className="flex gap-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={handleCustomKeyDown}
                    placeholder="Type to add…"
                    className="min-w-0 flex-1 rounded border border-border-subtle bg-bg-elevated px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    aria-label="Add custom value"
                    onClick={handleCustomAdd}
                    className="rounded border border-border-subtle px-2 py-1 text-xs hover:bg-bg-elevated focus:outline-none"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border-subtle px-3 py-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded px-3 py-1 text-xs text-text-secondary hover:bg-bg-row-hover focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded bg-accent px-3 py-1 text-xs text-white hover:opacity-90 focus:outline-none"
              >
                Apply
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
