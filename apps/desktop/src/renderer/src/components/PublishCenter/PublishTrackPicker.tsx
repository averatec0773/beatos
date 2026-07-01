import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CoverImage } from "@/components/CoverImage";
import { tracks as tracksApi, type Track } from "@/api/tracks";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (trackId: number) => void;
}

/** Minimal track picker for starting a publish from the Publish Center.
 *  Server-side search via tracks.list({ q }); picking a track hands its id back
 *  to the panel, which opens the existing PublishDialog. */
export function PublishTrackPicker({ open, onClose, onPick }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset the query each time the picker opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Debounced search (also runs on open with an empty query → recent tracks).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      tracksApi
        .list({ q: query || undefined })
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, query]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("publishCenter.publishTrack")}</DialogTitle>
        </DialogHeader>

        <div className="mb-2 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-2.5 py-1.5">
          <Search size={14} className="text-text-tertiary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("publishCenter.searchTracks")}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        <div className="beatos-scroll flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
          {loading ? (
            <div className="px-2 py-3 text-xs text-text-tertiary">
              {t("publishCenter.searching")}
            </div>
          ) : results.length === 0 ? (
            <div className="px-2 py-3 text-xs text-text-tertiary">
              {t("publishCenter.noTracksFound")}
            </div>
          ) : (
            results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onPick(t.id)}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-row-hover"
              >
                <CoverImage assetId={t.cover_asset_id} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{t.title}</span>
                {t.bpm != null && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-tertiary">
                    {t.bpm} BPM
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
