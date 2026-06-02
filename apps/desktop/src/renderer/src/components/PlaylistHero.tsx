import React, { useMemo } from "react";

import type { Track } from "@/api/tracks";
import { ListCoverMosaic } from "@/components/Sidebar/ListCoverMosaic";
import { useDominantColor } from "@/lib/use-dominant-color";

/**
 * Spotify-style hero shown at the top of a playlist (list) view: a large cover
 * mosaic, the "Playlist" eyebrow, the big name, and a track-count meta line,
 * over a gradient tinted by the first cover's dominant colour. Built entirely
 * from the already-loaded list tracks — no extra fetch.
 */
export function PlaylistHero({ name, tracks }: { name: string; tracks: Track[] }): React.JSX.Element {
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
        <span className="beatos-eyebrow">Playlist</span>
        <h1 className="truncate text-4xl font-extrabold leading-none tracking-tight">{name}</h1>
        <span className="text-sm text-text-secondary">
          {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
        </span>
      </div>
    </div>
  );
}
