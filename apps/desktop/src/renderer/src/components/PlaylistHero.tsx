import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Track } from "@/api/tracks";
import { ListCoverMosaic } from "@/components/Sidebar/ListCoverMosaic";
import { useDominantColor } from "@/lib/use-dominant-color";
import { useListStore } from "@/stores/lists";
import { useToastStore } from "@/stores/toast";

/**
 * Spotify-style hero shown at the top of a playlist (list) view: a large cover
 * mosaic, the "Playlist" eyebrow, the big name, and a track-count meta line,
 * over a gradient tinted by the first cover's dominant colour. Built entirely
 * from the already-loaded list tracks — no extra fetch.
 *
 * The name is inline-editable: a pencil button (or clicking the title) swaps it
 * for an input, committing on Enter/blur — the explicit affordance that used to
 * exist only as the sidebar right-click → Rename.
 */
export function PlaylistHero({
  name,
  tracks,
  listId,
}: {
  name: string;
  tracks: Track[];
  listId: number;
}): React.JSX.Element {
  const covers = useMemo(
    () =>
      tracks
        .map((t) => t.cover_asset_id)
        .filter((x): x is number => x != null)
        .slice(0, 4),
    [tracks],
  );
  const firstCover = useMemo(
    () => tracks.find((t) => t.cover_asset_id != null)?.cover_asset_id ?? null,
    [tracks],
  );
  const glow = useDominantColor(firstCover);
  const tint = glow ?? "44, 44, 52";

  const { t } = useTranslation();
  const rename = useListStore((s) => s.rename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function startEdit(): void {
    setDraft(name);
    setEditing(true);
  }

  async function commit(): Promise<void> {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) return;
    try {
      await rename(listId, trimmed);
    } catch (e) {
      useToastStore
        .getState()
        .show(
          "error",
          t("playlistHero.renameFailed", { error: e instanceof Error ? e.message : String(e) }),
        );
    }
  }

  return (
    <div
      className="relative flex items-end gap-5 px-6 pt-8 pb-6 flex-shrink-0"
      style={{
        background: `linear-gradient(180deg, rgba(${tint}, .55), rgba(${tint}, .12) 62%, transparent)`,
      }}
    >
      <div className="shrink-0 rounded-md shadow-[0_14px_44px_-14px_rgba(0,0,0,.85)]">
        <ListCoverMosaic covers={covers} size={128} />
      </div>
      <div className="min-w-0 flex flex-col gap-2 pb-1">
        <span className="beatos-eyebrow">{t("playlistHero.playlist")}</span>
        {editing ? (
          <input
            ref={inputRef}
            data-playlist-rename
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              else if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 bg-transparent border-b border-border-subtle text-4xl font-extrabold leading-none tracking-tight outline-none focus:border-accent"
          />
        ) : (
          <div className="group flex items-center gap-2 min-w-0">
            <h1
              onDoubleClick={startEdit}
              title={t("playlistHero.doubleClickRename")}
              className="truncate text-4xl font-extrabold leading-none tracking-tight"
            >
              {name}
            </h1>
            <button
              type="button"
              data-playlist-edit
              onClick={startEdit}
              aria-label={t("playlistHero.renameAria")}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-row-hover opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil size={16} />
            </button>
          </div>
        )}
        <span className="text-sm text-text-secondary">
          {t("playlistHero.trackCount", { count: tracks.length })}
        </span>
      </div>
    </div>
  );
}
