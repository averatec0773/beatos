import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { useTrackQueryStore } from "@/stores/track-query";

export function SearchInput(): React.JSX.Element {
  const q = useTrackQueryStore((s) => s.q);
  const setText = useTrackQueryStore((s) => s.setText);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && open) {
        setText("");
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setText]);

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
        value={q}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search title / tags / genre"
        className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          setText("");
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
