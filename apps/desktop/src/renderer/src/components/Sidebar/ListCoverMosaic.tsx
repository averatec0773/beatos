import React, { useEffect, useState } from "react";
import { Music2 } from "lucide-react";

import { tracks as tracksApi } from "@/api/tracks";
import { CoverImage } from "@/components/CoverImage";

/**
 * Fetches a list's member tracks once per listId and returns the first 4 cover
 * asset ids plus the total track count — enough to drive the sidebar mosaic and
 * its "N tracks" subtitle. Fine for the handful of lists in a producer's
 * sidebar; a covers-only endpoint would avoid pulling full rows if it scales.
 */
export function useListCovers(listId: number): { covers: number[]; count: number } {
  const [covers, setCovers] = useState<number[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    tracksApi
      .list({ list_id: listId })
      .then((rows) => {
        if (cancelled) return;
        setCount(rows.length);
        setCovers(
          rows
            .map((r) => r.cover_asset_id)
            .filter((x): x is number => x != null)
            .slice(0, 4),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCovers([]);
          setCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  return { covers, count };
}

interface Props {
  covers: number[];
  size?: number;
}

/**
 * Spotify-style playlist thumbnail: always a 2×2 collage, filled from the
 * available covers (top-left first), empty tiles for the rest, and a music-note
 * fallback when the list has no covers at all.
 */
export function ListCoverMosaic({ covers, size = 56 }: Props): React.JSX.Element {
  const box: React.CSSProperties = { width: size, height: size };

  if (covers.length === 0) {
    return (
      <div
        style={box}
        className="shrink-0 flex items-center justify-center rounded-md bg-bg-elevated-hover text-text-tertiary"
      >
        <Music2 size={Math.round(size * 0.4)} />
      </div>
    );
  }

  const cells: Array<number | null> = [
    covers[0] ?? null,
    covers[1] ?? null,
    covers[2] ?? null,
    covers[3] ?? null,
  ];
  return (
    <div
      style={box}
      className="shrink-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-bg-elevated-hover"
    >
      {cells.map((id, i) =>
        id == null ? (
          <div key={i} className="bg-bg-elevated-hover" />
        ) : (
          <CoverImage key={i} assetId={id} size={size / 2} responsive rounded={false} />
        ),
      )}
    </div>
  );
}
