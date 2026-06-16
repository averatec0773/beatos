import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useTrackQueryStore } from "@/stores/track-query";
import { facetsApi, type FacetValue } from "@/api/facets";
import { tracks } from "@/api/tracks";
import { SearchDropdown, type ChipField } from "@/components/SearchDropdown";
import { SearchOrb } from "@/components/SearchOrb";

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
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { field, value, rest };
}

export function SearchInput(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setText = useTrackQueryStore((s) => s.setText);

  const [focused, setFocused] = useState(false);
  const [box, setBox] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Dropdown data
  const [recent, setRecent] = useState<string[]>([]);
  const [topProducers, setTopProducers] = useState<FacetValue[]>([]);
  const [topGenres, setTopGenres] = useState<FacetValue[]>([]);
  const [topKeys, setTopKeys] = useState<FacetValue[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<{ id: number; title: string }[]>([]);

  const dropdownVisible = focused && box.trim().length === 0;

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
    setFocused(false);
  }, [setText]);

  // Close on click-outside, immediately. The input's `onBlur` alone is
  // unreliable for this: clicking a non-focusable region (empty space, a label,
  // the detail panel) does NOT blur the input, so `focused` would otherwise
  // stay true and the dropdown / bright orb stay "open" until you happen to
  // click something focusable. Gated on `focused` so it's inert when idle; the
  // dropdown is a DOM child of `rootRef`, so its own button clicks don't trip it.
  useEffect(() => {
    if (!focused) return;
    function onPointerDown(e: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFocused(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [focused]);

  // ⌘F to focus the (always-visible) search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
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
    // While an IME composition is in progress (e.g. typing English via a
    // Chinese IME), the Enter that confirms the candidate fires keydown with
    // isComposing=true. Acting on it here would mutate the controlled value
    // mid-composition and race the IME commit, duplicating the text
    // ("regalia" → "regalia regalia"). Ignore all keys while composing — the
    // first Enter confirms the IME, a second (non-composing) Enter submits.
    if (e.nativeEvent.isComposing) return;
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

  return (
    <div ref={rootRef} className="relative w-[460px] max-w-[46vw]">
      {/* Taller pill so the glowing orb (which replaces the search icon) reads
          at a prominent size; `overflow-hidden` crops the orb + its far-end
          fade to the rounded shape. The orb sits at z-0; input/clear float above. */}
      <div className="relative flex items-center h-[52px] bg-bg-elevated border border-border-subtle hover:border-text-tertiary focus-within:border-text-secondary rounded-full overflow-hidden transition-colors">
        <SearchOrb focused={focused} />
        <input
          ref={inputRef}
          value={box}
          onChange={(e) => applyBox(e.target.value)}
          onFocus={() => setFocused(true)}
          // Delay blur so dropdown button clicks register before it hides.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onInputKeyDown}
          placeholder={t("search.placeholder")}
          className="relative z-10 flex-1 min-w-0 bg-transparent pl-[58px] pr-2 text-base text-text-primary placeholder:text-text-tertiary focus:outline-none"
          // Before you type, the placeholder hint dissolves toward the right
          // (gradient fade). Once there's input, the mask is dropped so typed
          // text is never clipped.
          style={
            box.length === 0
              ? {
                  WebkitMaskImage:
                    "linear-gradient(to right, #000 0 38%, transparent 72%)",
                  maskImage: "linear-gradient(to right, #000 0 38%, transparent 72%)",
                }
              : undefined
          }
        />
        {box.length > 0 && (
          <button
            type="button"
            onClick={closeAndClear}
            className="relative z-10 mr-4 shrink-0 text-text-tertiary hover:text-text-primary"
            aria-label={t("search.clearAria")}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {dropdownVisible && (
        <SearchDropdown
          recent={recent}
          topProducers={topProducers}
          topGenres={topGenres}
          topKeys={topKeys}
          recentlyAdded={recentlyAdded}
          onPickQuery={(query) => {
            if (debounceRef.current != null) {
              window.clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            setBox(query);
            setText(query);
            setFocused(false);
            inputRef.current?.focus();
          }}
          onPickChip={(field, value) => {
            if (debounceRef.current != null) {
              window.clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            appendChip(field, value);
            setFocused(false);
          }}
          onOpenTrack={(id) => {
            navigate(`/tracks/${id}/edit`);
            closeAndClear();
          }}
          onRemoveRecent={(query) => {
            // Optimistic: drop it locally now, persist in the background. Keep
            // the input focused so the dropdown stays open.
            setRecent((prev) => prev.filter((r) => r !== query));
            void facetsApi.removeRecent(query);
            inputRef.current?.focus();
          }}
          onClearRecent={() => {
            setRecent([]);
            void facetsApi.clearRecent();
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
