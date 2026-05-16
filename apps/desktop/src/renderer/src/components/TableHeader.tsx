import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTrackQueryStore, type SortBy } from "@/stores/track-query";

const COLS: { label: string; field: SortBy | null; widthClass: string; align?: string }[] = [
  { label: "",        field: null,            widthClass: "w-12 flex-shrink-0" },
  { label: "",        field: null,            widthClass: "w-7 flex-shrink-0" },
  { label: "Title",   field: "title",         widthClass: "flex-1 min-w-0" },
  { label: "BPM",     field: "bpm",           widthClass: "w-20" },
  { label: "Key",     field: "key_signature", widthClass: "w-24" },
  { label: "Genre",   field: "genre",         widthClass: "w-36" },
  { label: "Updated", field: "updated_at",    widthClass: "w-24" },
];

export function TableHeader(): React.JSX.Element {
  const sortBy = useTrackQueryStore((s) => s.sortBy);
  const sortDir = useTrackQueryStore((s) => s.sortDir);
  const toggleSort = useTrackQueryStore((s) => s.toggleSort);

  return (
    <div
      role="row"
      className="h-9 px-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary border-b border-border-subtle bg-bg-base"
    >
      {COLS.map((c, i) => {
        const sortable = c.field !== null;
        const active = sortable && sortBy === c.field;
        return (
          <button
            key={i}
            type="button"
            data-column={c.field ?? ""}
            disabled={!sortable}
            onClick={sortable ? () => toggleSort(c.field!) : undefined}
            className={`${c.widthClass} ${c.align ?? ""} truncate flex items-center gap-1 ${sortable ? "hover:text-text-secondary cursor-pointer" : "cursor-default"}`}
          >
            <span>{c.label}</span>
            {active && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
          </button>
        );
      })}
    </div>
  );
}
