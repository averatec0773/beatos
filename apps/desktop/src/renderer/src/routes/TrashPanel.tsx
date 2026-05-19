import React, { useEffect } from "react";

import { tracks } from "@/api/tracks";
import { useTrashStore } from "@/stores/trash";
import { useTrackStore } from "@/stores/tracks";
import { CoverImage } from "@/components/CoverImage";

function formatTrashedAt(deletedAt: string | null): string {
  if (!deletedAt) return "unknown";
  const date = new Date(deletedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function TrashPanel(): React.JSX.Element {
  const list = useTrashStore((s) => s.list);
  const refresh = useTrashStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onRestore(id: number): Promise<void> {
    await tracks.restore(id);
    await refresh();
    void useTrackStore.getState().refresh();
    void useTrackStore.getState().refreshTotal();
  }

  async function onPurge(id: number, title: string): Promise<void> {
    if (!confirm(`Delete "${title}" forever? This cannot be undone.`)) return;
    await tracks.purge(id);
    await refresh();
  }

  return (
    <section className="beatos-scroll flex-1 overflow-y-auto p-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trash</h1>
        <span className="text-text-tertiary text-sm">
          {list.length} trashed track{list.length === 1 ? "" : "s"}
        </span>
      </header>
      {list.length === 0 ? (
        <div className="text-text-tertiary text-sm py-12 text-center">Trash is empty.</div>
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <div
              key={t.id}
              data-trash-row
              className="flex items-center gap-3 p-3 rounded-md border border-border-subtle bg-bg-elevated"
            >
              <CoverImage assetId={t.cover_asset_id ?? null} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.title}</div>
                <div className="text-xs text-text-tertiary">
                  Trashed {formatTrashedAt(t.deleted_at)}
                </div>
              </div>
              <button
                onClick={() => void onRestore(t.id)}
                className="text-xs px-3 py-1.5 rounded border border-border-subtle hover:bg-bg-row-hover"
              >
                Restore
              </button>
              <button
                onClick={() => void onPurge(t.id, t.title)}
                className="text-xs px-3 py-1.5 rounded border border-danger text-danger hover:bg-danger/10"
              >
                Delete forever
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
