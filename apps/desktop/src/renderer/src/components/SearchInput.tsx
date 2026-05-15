import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { useSearchStore } from "@/stores/search";

export function SearchInput(): React.JSX.Element {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Cmd+F (mac) or Ctrl+F (others) opens
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      // ESC closes (when input is focused)
      if (e.key === "Escape" && open) {
        clear();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, clear]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary hover:bg-bg-row-hover"
        aria-label="Search (⌘F)"
        title="Search (⌘F)"
      >
        <Search size={14} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-bg-elevated border border-border-subtle rounded-md px-2 py-1 w-64">
      <Search size={14} className="text-text-tertiary" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title / tags / genre"
        className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          clear();
          setOpen(false);
        }}
        className="text-text-tertiary hover:text-text-primary"
        aria-label="Close search"
      >
        <X size={12} />
      </button>
    </div>
  );
}
