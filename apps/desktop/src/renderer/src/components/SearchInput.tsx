import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useTrackQueryStore } from "@/stores/track-query";
import { facetsApi, type FacetValue } from "@/api/facets";
import { tracks } from "@/api/tracks";
import { SearchDropdown, type ChipField } from "@/components/SearchDropdown";

const FIELD_TO_CHIP: Record<string, ChipField> = {
  genre: "genres",
  mood: "moods",
  producer: "producers",
  key: "keys",
};

// Pure helper — extracts a single COMPLETED `field:value` chip token from the
// box text. Only fires when there is a trailing delimiter (space) so partial
// typing like `genre:tr` isn't absorbed mid-word. Supports a quoted value
// (`producer:"young chop"`). `bpm:` / `has:` are NOT chip fields and return
// null. Returns the matched chip field + value and the remaining free text
// (with the token removed), or null when no completed chip token is present.
export function extractCompletedChipToken(
  text: string,
): { field: ChipField; value: string; rest: string } | null {
  // token: field:value followed by at least one space (the delimiter).
  // value is either a double-quoted string or a run of non-space chars.
  const re = /(genre|mood|producer|key):("([^"]*)"|[^\s]+)\s/i;
  const m = re.exec(text);
  if (!m) return null;
  const field = FIELD_TO_CHIP[m[1].toLowerCase()];
  if (!field) return null;
  const raw = m[3] !== undefined ? m[3] : m[2];
  const value = raw.trim();
  if (!value) return null;
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  return { field, value, rest };
}

export function SearchInput(): React.JSX.Element {
  const navigate = useNavigate();
  const setText = useTrackQueryStore((s) => s.setText);

  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [box, setBox] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Dropdown data
  const [recent, setRecent] = useState<string[]>([]);
  const [topProducers, setTopProducers] = useState<FacetValue[]>([]);
  const [topGenres, setTopGenres] = useState<FacetValue[]>([]);
  const [topKeys, setTopKeys] = useState<FacetValue[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<{ id: number; title: string }[]>([]);

  const dropdownVisible = open && focused && box.trim().length === 0;

  // Append a value to a chip filter array (dedupe).
  const appendChip = useCallback((field: ChipField, value: string): void => {
    const state = useTrackQueryStore.getState();
    const current = state.filters[field];
    if (current.includes(value)) return;
    const next = [...current, value];
    if (field === "producers") state.setProducerFilter(next);
    else if (field === "genres") state.setGenreFilter(next);
    else if (field === "moods") state.setMoodFilter(next);
    else state.setKeyFilter(next);
  }, []);

  // Debounced free-text → setText.
  const scheduleSetText = useCallback(
    (value: string): void => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setText(value);
      }, 250);
    },
    [setText],
  );

  // Handle a new box value: absorb any completed chip token(s), then schedule
  // setText for the remaining free text.
  const applyBox = useCallback(
    (raw: string): void => {
      let text = raw;
      // Absorb every completed chip token currently present.
      for (;;) {
        const tok = extractCompletedChipToken(text);
        if (!tok) break;
        appendChip(tok.field, tok.value);
        text = tok.rest;
      }
      setBox(text);
      scheduleSetText(text);
    },
    [appendChip, scheduleSetText],
  );

  // Load dropdown data when it becomes visible. Guarded against close/unmount.
  useEffect(() => {
    if (!dropdownVisible) return;
    let alive = true;
    void (async () => {
      const [r, prod, gen, keys, added] = await Promise.all([
        facetsApi.recent().catch(() => []),
        facetsApi.top("producer").catch(() => []),
        facetsApi.top("genre").catch(() => []),
        facetsApi.top("key").catch(() => []),
        tracks.list({ sort_by: "created_at", sort_dir: "desc" }).catch(() => []),
      ]);
      if (!alive) return;
      setRecent(r);
      setTopProducers(prod);
      setTopGenres(gen);
      setTopKeys(keys);
      setRecentlyAdded(added.slice(0, 5).map((t) => ({ id: t.id, title: t.title })));
    })();
    return () => {
      alive = false;
    };
  }, [dropdownVisible]);

  const closeAndClear = useCallback((): void => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    setBox("");
    setText("");
    setOpen(false);
    setFocused(false);
  }, [setText]);

  // ⌘F to open + focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clear debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndClear();
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Absorb any trailing completed token (Enter acts as a delimiter too).
      applyBox(box.endsWith(" ") ? box : box + " ");
      const query = box.trim();
      if (query.length > 0) {
        void facetsApi.pushRecent(query).catch(() => undefined);
      }
      setFocused(false);
    }
  }

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
    <div className="relative w-64">
      <div className="flex items-center gap-2 bg-bg-elevated border border-border-subtle rounded-md px-2 py-1">
        <Search size={14} className="text-text-tertiary" />
        <input
          ref={inputRef}
          value={box}
          onChange={(e) => applyBox(e.target.value)}
          onFocus={() => setFocused(true)}
          // Delay blur so dropdown button clicks register before it hides.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onInputKeyDown}
          placeholder="Search title / tags / genre:trap"
          className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={closeAndClear}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Close search"
        >
          <X size={12} />
        </button>
      </div>

      {dropdownVisible && (
        <SearchDropdown
          recent={recent}
          topProducers={topProducers}
          topGenres={topGenres}
          topKeys={topKeys}
          recentlyAdded={recentlyAdded}
          onPickQuery={(query) => {
            setBox(query);
            setText(query);
            setFocused(false);
            inputRef.current?.focus();
          }}
          onPickChip={(field, value) => {
            appendChip(field, value);
            setFocused(false);
          }}
          onOpenTrack={(id) => {
            navigate(`/tracks/${id}/edit`);
            closeAndClear();
          }}
        />
      )}
    </div>
  );
}
