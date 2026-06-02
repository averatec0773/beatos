import React, { useEffect, useMemo, useState } from "react";
import { FileArchive, FolderOpen, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { lists as listsApi, type ExportManifestItem, type ExportMode } from "@/api/lists";
import { formatBytes } from "@/lib/format-bytes";
import { useToastStore } from "@/stores/toast";

const ROLE_LABEL: Record<string, string> = {
  audio_tagged_wav: "WAV (tagged)",
  audio_untagged_wav: "WAV (untagged)",
  audio_tagged_mp3: "MP3 (tagged)",
  audio_untagged_mp3: "MP3 (untagged)",
  loop: "Loop",
  stems: "Stems",
};

// Quick-select groups: one click toggles every file of that type across all
// tracks (e.g. "all WAVs"), the bulk-selection ask.
const ROLE_GROUPS: { key: string; label: string; roles: string[] }[] = [
  { key: "wav", label: "WAV", roles: ["audio_tagged_wav", "audio_untagged_wav"] },
  { key: "mp3", label: "MP3", roles: ["audio_tagged_mp3", "audio_untagged_mp3"] },
  { key: "loop", label: "Loop", roles: ["loop"] },
  { key: "stems", label: "Stems", roles: ["stems"] },
];

interface Props {
  open: boolean;
  listId: number;
  listName: string;
  onClose: () => void;
}

/**
 * Package a playlist's track files into a ZIP or a plain folder (one subfolder
 * per track). Lists every track's available files as checkboxes — non-missing
 * ones pre-checked — so the producer can prune what gets sent (a beat pack for a
 * singer, a loopkit, …). The Python sidecar does the zip/copy to a folder the
 * user picks here.
 */
export function PlaylistExportDialog({
  open,
  listId,
  listName,
  onClose,
}: Props): React.JSX.Element {
  const [manifest, setManifest] = useState<ExportManifestItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<ExportMode>("zip");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setManifest(null);
    listsApi
      .exportManifest(listId)
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        // Pre-check every existing (non-missing) file.
        const init = new Set<number>();
        for (const t of m) for (const f of t.files) if (!f.missing) init.add(f.asset_id);
        setSelected(init);
      })
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", "无法读取歌单文件清单");
      });
    return () => {
      cancelled = true;
    };
  }, [open, listId]);

  const { count, bytes } = useMemo(() => {
    let n = 0;
    let b = 0;
    for (const t of manifest ?? [])
      for (const f of t.files)
        if (selected.has(f.asset_id)) {
          n += 1;
          b += f.size_bytes ?? 0;
        }
    return { count: n, bytes: b };
  }, [manifest, selected]);

  // Non-missing asset ids per quick-select group + the full set, for the bar.
  const { allIds, groupIds } = useMemo(() => {
    const all: number[] = [];
    const groups: Record<string, number[]> = {};
    for (const t of manifest ?? [])
      for (const f of t.files) {
        if (f.missing) continue;
        all.push(f.asset_id);
        for (const g of ROLE_GROUPS)
          if (g.roles.includes(f.role)) (groups[g.key] ??= []).push(f.asset_id);
      }
    return { allIds: all, groupIds: groups };
  }, [manifest]);

  function setMany(ids: number[], on: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleGroup(ids: number[]): void {
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setMany(ids, !allOn);
  }

  function toggleAsset(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTrack(item: ExportManifestItem): void {
    const ids = item.files.filter((f) => !f.missing).map((f) => f.asset_id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function handleExport(): Promise<void> {
    if (count === 0 || !manifest) return;
    const dest = await window.beatos.openFolderDialog();
    if (!dest) return;
    const items = manifest
      .map((t) => ({
        track_id: t.track_id,
        asset_ids: t.files.filter((f) => selected.has(f.asset_id)).map((f) => f.asset_id),
      }))
      .filter((i) => i.asset_ids.length > 0);
    setBusy(true);
    try {
      const res = await listsApi.exportPackage(listId, { mode, dest, items });
      const toast = useToastStore.getState();
      const skip = res.skipped.length ? `（跳过 ${res.skipped.length} 个缺失文件）` : "";
      toast.show("success", `已导出 ${res.file_count} 个文件${skip}`);
      void window.beatos.revealInFinder(res.output_path);
      onClose();
    } catch (e) {
      useToastStore
        .getState()
        .show("error", `导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导出歌单「{listName}」</DialogTitle>
          <DialogDescription>
            勾选要打包的文件，按 track 分文件夹。可打包为 ZIP 或直接复制到文件夹。
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 inline-flex rounded-md border border-border-subtle p-0.5 text-sm">
          {(["zip", "folder"] as ExportMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 ${
                mode === m ? "bg-bg-row-active text-text-primary" : "text-text-secondary"
              }`}
            >
              {m === "zip" ? <FileArchive size={14} /> : <FolderOpen size={14} />}
              {m === "zip" ? "ZIP 压缩包" : "复制到文件夹"}
            </button>
          ))}
        </div>

        {manifest != null && manifest.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="beatos-eyebrow mr-1">批量</span>
            <button
              type="button"
              onClick={() => setMany(allIds, true)}
              className="rounded-md border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
            >
              全选
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-md border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
            >
              清空
            </button>
            {ROLE_GROUPS.filter((g) => (groupIds[g.key]?.length ?? 0) > 0).map((g) => {
              const ids = groupIds[g.key];
              const allOn = ids.every((id) => selected.has(id));
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => toggleGroup(ids)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    allOn
                      ? "border-accent bg-accent-soft text-text-primary"
                      : "border-border-subtle hover:bg-bg-row-hover"
                  }`}
                >
                  {g.label} ({ids.length})
                </button>
              );
            })}
          </div>
        )}

        <div className="max-h-[46vh] overflow-y-auto beatos-scroll -mx-1 px-1">
          {manifest == null ? (
            <div className="py-8 text-center text-sm text-text-tertiary">读取中…</div>
          ) : manifest.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-tertiary">歌单是空的。</div>
          ) : (
            manifest.map((t) => {
              const existing = t.files.filter((f) => !f.missing).map((f) => f.asset_id);
              const allOn = existing.length > 0 && existing.every((id) => selected.has(id));
              return (
                <div key={t.track_id} className="border-b border-border-subtle py-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-white"
                      checked={allOn}
                      disabled={existing.length === 0}
                      onChange={() => toggleTrack(t)}
                    />
                    <span className="text-sm font-medium truncate">{t.title}</span>
                    {t.files.length === 0 && (
                      <span className="text-xs text-text-tertiary">无文件</span>
                    )}
                  </label>
                  <div className="mt-1 ml-6 flex flex-col gap-1">
                    {t.files.map((f) => (
                      <label
                        key={f.asset_id}
                        className={`flex items-center gap-2 text-xs ${
                          f.missing ? "opacity-40" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-white"
                          checked={selected.has(f.asset_id)}
                          disabled={f.missing}
                          onChange={() => toggleAsset(f.asset_id)}
                        />
                        <span className="w-28 shrink-0 text-text-secondary">
                          {ROLE_LABEL[f.role] ?? f.role}
                        </span>
                        <span className="flex-1 truncate text-text-primary" title={f.filename}>
                          {f.filename}
                          {f.missing && " (缺失)"}
                        </span>
                        <span className="font-mono text-text-tertiary">
                          {formatBytes(f.size_bytes)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-text-tertiary">
            已选 {count} 个文件{count > 0 ? ` · ${formatBytes(bytes)}` : ""}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm hover:bg-bg-row-hover"
          >
            取消
          </button>
          <button
            type="button"
            disabled={count === 0 || busy}
            onClick={handleExport}
            className="btn-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
            选择位置并导出
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
