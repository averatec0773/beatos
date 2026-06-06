import React, { useEffect, useMemo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { tracks } from "@/api/tracks";
import { useTrashStore } from "@/stores/trash";
import { useTrackStore } from "@/stores/tracks";
import { useToastStore } from "@/stores/toast";
import { useAppLanguageStore } from "@/stores/app-language";
import { formatRelativeTime, formatDate } from "@/i18n/format";
import { CoverImage } from "@/components/CoverImage";
import { BulkActionBar, type BulkAction } from "@/components/BulkActionBar";
import type { AppLanguage } from "@/i18n/resources";

// Module scope so Date.now()/new Date() are not called during component render
// (react-hooks/purity), mirroring the original module-level helper.
function formatTrashedAt(lang: AppLanguage, trashedAtMs: number | null): string {
  return trashedAtMs != null
    ? formatRelativeTime(lang, trashedAtMs, Date.now())
    : formatDate(lang, new Date());
}

export function TrashPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const lang = useAppLanguageStore((s) => s.language);

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
      .show("success", t("trash.restored", { count: ids.length }));
  }

  async function onPurge(ids: number[], names?: string): Promise<void> {
    const msg =
      ids.length === 1
        ? t("trash.deleteOneConfirm", { name: names ?? `#${ids[0]}` })
        : t("trash.deleteManyConfirm", { count: ids.length });
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
      .show("success", t("trash.deleted", { count: ids.length }));
  }

  async function onEmptyAll(): Promise<void> {
    if (list.length === 0) return;
    if (!confirm(t("trash.deleteAllConfirm", { count: list.length }))) return;
    const r = await tracks.purgeAllTrash();
    await refresh();
    useToastStore
      .getState()
      .show("success", t("trash.emptied", { count: r.purged }));
  }

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        key: "restore",
        label: t("trash.restore"),
        icon: <RotateCcw size={14} />,
        onClick: async () => {
          const ids = Array.from(selectedIds);
          clearSelection();
          await onRestore(ids);
        },
      },
      {
        key: "purge",
        label: t("trash.deleteForever"),
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
    [selectedIds, clearSelection, t],
  );

  return (
    <section className="beatos-scroll flex-1 overflow-y-auto p-8 relative rounded-xl beatos-card">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold select-none">{t("trash.title")}</h1>
        <div className="flex items-center gap-3">
          <span className="text-text-tertiary text-sm select-none">
            {t("trash.count", { count: list.length })}
          </span>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => void onEmptyAll()}
              className="text-xs px-3 py-1.5 rounded border border-danger text-danger hover:bg-danger/10"
              data-trash-empty-all
            >
              {t("trash.emptyAll")}
            </button>
          )}
        </div>
      </header>
      {list.length === 0 ? (
        <div className="text-text-tertiary text-sm py-12 text-center">{t("trash.empty")}</div>
      ) : (
        <div className="space-y-2">
          {list.map((row) => {
            const isSelected = selectedIds.has(row.id);
            const trashedAtMs = row.deleted_at ? new Date(row.deleted_at).getTime() : null;
            return (
              <div
                key={row.id}
                data-trash-row
                data-trash-row-selected={isSelected || undefined}
                onClick={(e) => {
                  if (e.shiftKey) selectOne(row.id, "range");
                  else if (e.metaKey || e.ctrlKey) selectOne(row.id, "toggle");
                  else selectOne(row.id, "replace");
                }}
                className={`flex items-center gap-3 p-3 rounded-md border bg-bg-elevated cursor-pointer select-none transition-colors ${
                  isSelected
                    ? "border-accent bg-accent-soft"
                    : "border-border-subtle hover:bg-bg-row-hover"
                }`}
              >
                <CoverImage assetId={row.cover_asset_id ?? null} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{row.title}</div>
                  <div className="text-xs text-text-tertiary">
                    {t("trash.trashedPrefix")}{" "}
                    {formatTrashedAt(lang, trashedAtMs)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRestore([row.id]);
                  }}
                  className="text-xs px-3 py-1.5 rounded border border-border-subtle hover:bg-bg-row-hover"
                >
                  {t("trash.restore")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onPurge([row.id], row.title);
                  }}
                  className="text-xs px-3 py-1.5 rounded border border-danger text-danger hover:bg-danger/10"
                >
                  {t("trash.deleteForever")}
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
