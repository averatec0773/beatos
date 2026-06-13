import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, FileAudio, ArrowUp, Image as ImageIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFileBrowserStore, type FileFilter } from "@/stores/file-browser";

interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  ext: string | null;
}
interface FsListing {
  cwd: string;
  parent: string | null;
  entries: FsEntry[];
}

function matchesFilter(entry: FsEntry, filters: FileFilter[]): boolean {
  if (entry.is_dir) return true;
  const exts = filters.flatMap((f) => f.extensions).map((e) => e.toLowerCase());
  if (exts.length === 0) return true;
  return entry.ext != null && exts.includes(entry.ext);
}

/**
 * Imperative file/folder picker for the web build. The web platform impls call
 * useFileBrowserStore.request(...); this host (mounted once in App) renders the
 * modal, browses the server's filesystem via /api/fs/list, and resolves the
 * picked absolute path. In Electron this never opens (native dialogs are used).
 */
export function FileBrowserDialog(): React.JSX.Element {
  const { t } = useTranslation();
  const open = useFileBrowserStore((s) => s.open);
  const mode = useFileBrowserStore((s) => s.mode);
  const filters = useFileBrowserStore((s) => s.filters);
  const select = useFileBrowserStore((s) => s.select);
  const cancel = useFileBrowserStore((s) => s.cancel);

  const [listing, setListing] = useState<FsListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  async function load(path?: string): Promise<void> {
    setLoading(true);
    setError(null);
    setSelected(null);
    // Clear the previous listing so a stale cwd/parent can't be acted on while a
    // new load is in flight (the modal never unmounts, so listing persists across
    // re-opens) — this disables Up + "Select this folder" until the fetch lands.
    setListing(null);
    try {
      const qs = path ? `?path=${encodeURIComponent(path)}` : "";
      const res = await fetch(`/api/fs/list${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      setListing((await res.json()) as FsListing);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Load the home directory each time the modal opens.
  useEffect(() => {
    if (open) void load(undefined);
  }, [open]);

  const exts = filters.flatMap((f) => f.extensions);
  const visible = listing?.entries.filter((e) => matchesFilter(e, filters)) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "folder" ? t("fileBrowser.titleFolder") : t("fileBrowser.titleFile")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
          <button
            type="button"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && void load(listing.parent)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-subtle hover:bg-bg-row-hover disabled:opacity-40"
          >
            <ArrowUp size={13} /> {t("fileBrowser.up")}
          </button>
          <span className="truncate font-mono">{listing?.cwd ?? ""}</span>
        </div>

        <div className="beatos-scroll h-72 overflow-y-auto rounded border border-border-subtle bg-bg-base">
          {loading && <div className="p-3 text-sm text-text-tertiary">{t("common.loading")}</div>}
          {error && (
            <div className="p-3 text-sm text-danger">{t("fileBrowser.loadFailed", { error })}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className="p-3 text-sm text-text-tertiary">{t("fileBrowser.empty")}</div>
          )}
          {!loading &&
            !error &&
            visible.map((e) => {
              const isSelectableFile = !e.is_dir && mode === "file";
              const active = selected === e.path;
              return (
                <button
                  key={e.path}
                  type="button"
                  data-fs-entry
                  onClick={() => {
                    if (e.is_dir) void load(e.path);
                    else if (isSelectableFile) setSelected(e.path);
                  }}
                  onDoubleClick={() => isSelectableFile && select(e.path)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-row-hover ${
                    active ? "bg-bg-row-selected" : ""
                  }`}
                >
                  {e.is_dir ? (
                    <Folder size={15} className="shrink-0 text-text-secondary" />
                  ) : e.ext && ["jpg", "jpeg", "png", "webp"].includes(e.ext) ? (
                    <ImageIcon size={15} className="shrink-0 text-text-tertiary" />
                  ) : (
                    <FileAudio size={15} className="shrink-0 text-text-tertiary" />
                  )}
                  <span className="truncate flex-1">{e.name}</span>
                </button>
              );
            })}
        </div>

        <DialogFooter>
          {exts.length > 0 && (
            <span className="text-xs text-text-tertiary mr-auto self-center">
              {t("fileBrowser.filteredHint", { exts: exts.join(", ") })}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          {mode === "folder" ? (
            <Button size="sm" disabled={!listing} onClick={() => listing && select(listing.cwd)}>
              {t("fileBrowser.selectFolder")}
            </Button>
          ) : (
            <Button size="sm" disabled={!selected} onClick={() => selected && select(selected)}>
              {t("fileBrowser.select")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
