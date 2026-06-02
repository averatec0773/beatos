import React, { useEffect, useMemo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { tracks } from "@/api/tracks";
import { useTrashStore } from "@/stores/trash";
import { useTrackStore } from "@/stores/tracks";
import { useToastStore } from "@/stores/toast";
import { CoverImage } from "@/components/CoverImage";
import { BulkActionBar, type BulkAction } from "@/components/BulkActionBar";

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
  const selectedIds = useTrashStore((s) => s.selectedIds);
  const selectOne = useTrashStore((s) => s.selectOne);
  const selectAll = useTrashStore((s) => s.selectAll);
  const clearSelection = useTrashStore((s) => s.clearSelection);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cmd/Ctrl+A → select all in trash; Esc → clear.
  useEffect(() => {
    function isTextTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (isTextTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === "Escape") clearSelection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectAll, clearSelection]);

  async function onRestore(ids: number[]): Promise<void> {
    for (const id of ids) {
      try {
        await tracks.restore(id);
      } catch (e) {
        console.warn("[trash.restore] failed for", id, e);
      }
    }
    await refresh();
    void useTrackStore.getState().refresh();
    void useTrackStore.getState().refreshTotal();
    useToastStore
      .getState()
      .show("success", ids.length === 1 ? "Restored 1 track" : `Restored ${ids.length} tracks`);
  }

  async function onPurge(ids: number[], names?: string): Promise<void> {
    const msg =
      ids.length === 1
        ? `Delete "${names ?? `#${ids[0]}`}" forever? This cannot be undone.`
        : `Delete ${ids.length} tracks forever? This cannot be undone.`;
    if (!confirm(msg)) return;
    for (const id of ids) {
      try {
        await tracks.purge(id);
      } catch (e) {
        console.warn("[trash.purge] failed for", id, e);
      }
    }
    await refresh();
    useToastStore
      .getState()
      .show(
        "success",
        ids.length === 1
          ? "Permanently deleted 1 track"
          : `Permanently deleted ${ids.length} tracks`,
      );
  }

  async function onEmptyAll(): Promise<void> {
    if (list.length === 0) return;
    if (
      !confirm(
        `Permanently delete ALL ${list.length} trashed track${
          list.length === 1 ? "" : "s"
        }? This cannot be undone.`,
      )
    )
      return;
    const r = await tracks.purgeAllTrash();
    await refresh();
    useToastStore
      .getState()
      .show("success", `Emptied trash (${r.purged} track${r.purged === 1 ? "" : "s"})`);
  }

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        key: "restore",
        label: "Restore",
        icon: <RotateCcw size={14} />,
        onClick: async () => {
          const ids = Array.from(selectedIds);
          clearSelection();
          await onRestore(ids);
        },
      },
      {
        key: "purge",
        label: "Delete forever",
        icon: <Trash2 size={14} />,
        variant: "danger",
        onClick: async () => {
          const ids = Array.from(selectedIds);
          clearSelection();
          await onPurge(ids);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, clearSelection],
  );

  return (
    <section className="beatos-scroll flex-1 overflow-y-auto p-8 relative rounded-xl bg-bg-elevated">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold select-none">Trash</h1>
        <div className="flex items-center gap-3">
          <span className="text-text-tertiary text-sm select-none">
            {list.length} trashed track{list.length === 1 ? "" : "s"}
          </span>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => void onEmptyAll()}
              className="text-xs px-3 py-1.5 rounded border border-danger text-danger hover:bg-danger/10"
              data-trash-empty-all
            >
              Empty trash
            </button>
          )}
        </div>
      </header>
      {list.length === 0 ? (
        <div className="text-text-tertiary text-sm py-12 text-center">Trash is empty.</div>
      ) : (
        <div className="space-y-2">
          {list.map((t) => {
            const isSelected = selectedIds.has(t.id);
            return (
              <div
                key={t.id}
                data-trash-row
                data-trash-row-selected={isSelected || undefined}
                onClick={(e) => {
                  if (e.shiftKey) selectOne(t.id, "range");
                  else if (e.metaKey || e.ctrlKey) selectOne(t.id, "toggle");
                  else selectOne(t.id, "replace");
                }}
                className={`flex items-center gap-3 p-3 rounded-md border bg-bg-elevated cursor-pointer select-none transition-colors ${
                  isSelected
                    ? "border-accent bg-accent-soft"
                    : "border-border-subtle hover:bg-bg-row-hover"
                }`}
              >
                <CoverImage assetId={t.cover_asset_id ?? null} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-text-tertiary">
                    Trashed {formatTrashedAt(t.deleted_at)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRestore([t.id]);
                  }}
                  className="text-xs px-3 py-1.5 rounded border border-border-subtle hover:bg-bg-row-hover"
                >
                  Restore
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onPurge([t.id], t.title);
                  }}
                  className="text-xs px-3 py-1.5 rounded border border-danger text-danger hover:bg-danger/10"
                >
                  Delete forever
                </button>
              </div>
            );
          })}
        </div>
      )}
      <BulkActionBar count={selectedIds.size} actions={bulkActions} onClear={clearSelection} />
    </section>
  );
}
