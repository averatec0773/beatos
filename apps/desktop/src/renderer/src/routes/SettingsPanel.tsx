import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { useSourceStore } from "@/stores/sources";
import { useTrackStore } from "@/stores/tracks";
import { distinct } from "@/api/distinct";
import { producers as producersApi } from "@/api/producers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function StorageSection(): React.JSX.Element {
  const [dbPath, setDbPath] = useState<string>("");

  useEffect(() => {
    window.beatos.getDbPath().then(setDbPath).catch(() => setDbPath(""));
  }, []);

  async function onChange(): Promise<void> {
    const newFolder = await window.beatos.openFolderDialog();
    if (!newFolder) return;
    const fullPath = `${newFolder}/global.db`;
    try {
      const r = await window.beatos.setDbPath(fullPath);
      if (r.restartRequired) {
        alert("Database path changed. Please restart BeatOS for the new location to take effect.");
      }
      setDbPath(fullPath);
    } catch (e) {
      alert(`Failed to update db path: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Storage</h2>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
          Catalog database path
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-bg-elevated rounded-md text-xs truncate border border-border-subtle">
            {dbPath || "Loading…"}
          </code>
          <button
            type="button"
            onClick={onChange}
            className="px-3 py-2 rounded-md border border-border-subtle text-sm hover:bg-bg-row-hover"
          >
            Change…
          </button>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          A restart is required after changing this path.
        </p>
      </div>
    </section>
  );
}

function SourcesSection(): React.JSX.Element {
  const sources = useSourceStore((s) => s.all);
  const refresh = useSourceStore((s) => s.refresh);
  const add = useSourceStore((s) => s.add);
  const remove = useSourceStore((s) => s.remove);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onAdd(): Promise<void> {
    const folder = await window.beatos.openFolderDialog();
    if (!folder) return;
    try {
      await add({ root_path: folder });
    } catch (e) {
      alert(`Failed to add Source: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function onRemove(id: number, name: string): Promise<void> {
    if (!confirm(`Remove Source "${name}"? This won't delete files on disk.`)) return;
    try {
      await remove(id);
    } catch (e) {
      alert(`Failed to remove: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Sources</h2>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover text-sm"
        >
          <Plus size={14} /> Add Source
        </button>
      </div>
      <div className="divide-y divide-border-subtle border border-border-subtle rounded-md overflow-hidden">
        {sources.length === 0 ? (
          <div className="px-4 py-3 text-text-tertiary text-sm">No Sources configured.</div>
        ) : (
          sources.map((s) => (
            <div key={s.id} className="px-4 py-3 flex items-center gap-3 bg-bg-elevated">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{s.name}</div>
                <code className="text-[11px] text-text-tertiary truncate block">{s.root_path}</code>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                {s.status}
              </span>
              <button
                type="button"
                onClick={() => onRemove(s.id, s.name)}
                className="text-danger text-xs hover:underline"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type PendingAction =
  | { kind: "rename"; from: string; to: string }
  | { kind: "merge"; from: string[]; to: string }
  | { kind: "delete"; from: string[] };

function ProducersSection(): React.JSX.Element {
  const [items, setItems] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [affected, setAffected] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const trackRefresh = useTrackStore((s) => s.refresh);

  const refresh = useCallback(async () => {
    const list = await distinct.values("producer");
    setItems(list);
    setSelected((prev) => new Set(Array.from(prev).filter((v) => list.includes(v))));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  function toggle(value: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function previewAndConfirm(action: PendingAction): Promise<void> {
    const from = action.kind === "rename" ? [action.from] : action.from;
    const { affected: n } = await producersApi.preview(from);
    setAffected(n);
    setPending(action);
  }

  async function commit(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "rename") {
        await producersApi.rewrite([pending.from], pending.to);
      } else if (pending.kind === "merge") {
        await producersApi.rewrite(pending.from, pending.to);
      } else {
        await producersApi.rewrite(pending.from, null);
      }
      setSelected(new Set());
      setPending(null);
      setAffected(null);
      await refresh();
      await trackRefresh();
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function onRenameClick(): void {
    if (selectedList.length !== 1) return;
    setRenameInput(selectedList[0]);
    setRenameOpen(true);
  }

  function submitRename(): void {
    const trimmed = renameInput.trim();
    const original = selectedList[0];
    if (!trimmed || trimmed === original) {
      setRenameOpen(false);
      return;
    }
    setRenameOpen(false);
    void previewAndConfirm({ kind: "rename", from: original, to: trimmed });
  }

  function onMergeClick(): void {
    if (selectedList.length < 2) return;
    setMergeTarget(selectedList[0]);
    setMergeOpen(true);
  }

  function submitMerge(): void {
    const trimmed = mergeTarget.trim();
    if (!trimmed) {
      setMergeOpen(false);
      return;
    }
    setMergeOpen(false);
    void previewAndConfirm({ kind: "merge", from: selectedList, to: trimmed });
  }

  function onDeleteClick(): void {
    if (selectedList.length === 0) return;
    void previewAndConfirm({ kind: "delete", from: selectedList });
  }

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Producers</h2>
        {selectedList.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={onRenameClick}
              disabled={selectedList.length !== 1 || busy}
              className="px-3 py-1.5 rounded-md border border-border-subtle hover:bg-bg-row-hover disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="producer-rename-btn"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={onMergeClick}
              disabled={selectedList.length < 2 || busy}
              className="px-3 py-1.5 rounded-md border border-border-subtle hover:bg-bg-row-hover disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="producer-merge-btn"
            >
              Merge…
            </button>
            <button
              type="button"
              onClick={onDeleteClick}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-danger hover:bg-bg-row-hover disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="producer-delete-btn"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="divide-y divide-border-subtle border border-border-subtle rounded-md overflow-hidden">
        {items === null ? (
          <div className="px-4 py-3 text-text-tertiary text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-3 text-text-tertiary text-sm">No producers yet.</div>
        ) : (
          items.map((name) => {
            const isChecked = selected.has(name);
            return (
              <label
                key={name}
                className="px-4 py-2.5 flex items-center gap-3 bg-bg-elevated cursor-pointer hover:bg-bg-row-hover"
                data-testid="producer-row"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(name)}
                  className="accent-accent"
                />
                <span className="flex-1 text-sm text-text-primary truncate">{name}</span>
              </label>
            );
          })
        )}
      </div>
      {selectedList.length > 0 && (
        <p className="mt-2 text-xs text-text-tertiary">
          {selectedList.length} selected — Rename (1) · Merge (2+) · Delete (any)
        </p>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename producer</DialogTitle>
            <DialogDescription>
              Rename {selectedList[0] ? `"${selectedList[0]}"` : ""} across all tracks.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
            }}
            autoFocus
            className="w-full px-3 py-2 bg-bg-base border border-border-subtle rounded-md text-sm"
            data-testid="producer-rename-input"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitRename}
              className="px-3 py-1.5 rounded-md bg-accent text-text-on-accent text-sm"
              data-testid="producer-rename-submit"
            >
              Rename
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge producers</DialogTitle>
            <DialogDescription>
              Merge {selectedList.length} producers into a single name. All occurrences
              of the selected names will be replaced.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitMerge();
            }}
            autoFocus
            className="w-full px-3 py-2 bg-bg-base border border-border-subtle rounded-md text-sm"
            data-testid="producer-merge-input"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setMergeOpen(false)}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitMerge}
              className="px-3 py-1.5 rounded-md bg-accent text-text-on-accent text-sm"
              data-testid="producer-merge-submit"
            >
              Merge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setAffected(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "rename" && "Confirm rename"}
              {pending?.kind === "merge" && "Confirm merge"}
              {pending?.kind === "delete" && "Confirm delete"}
            </DialogTitle>
            <DialogDescription data-testid="producer-confirm-body">
              {pending?.kind === "rename" && (
                <>
                  Rename <strong>{pending.from}</strong> → <strong>{pending.to}</strong>.
                </>
              )}
              {pending?.kind === "merge" && (
                <>
                  Merge {pending.from.length} producers → <strong>{pending.to}</strong>.
                </>
              )}
              {pending?.kind === "delete" && (
                <>
                  Delete {pending.from.length} producer
                  {pending.from.length > 1 ? "s" : ""} from all tracks.
                </>
              )}
              {affected !== null && (
                <>
                  {" "}
                  This will affect <strong>{affected}</strong> track
                  {affected === 1 ? "" : "s"}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setAffected(null);
              }}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-accent text-text-on-accent text-sm disabled:opacity-50"
              data-testid="producer-confirm-commit"
            >
              {busy ? "Working…" : "Apply"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AboutSection(): React.JSX.Element {
  return (
    <section className="mt-10 pt-6 border-t border-border-subtle">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-3">
        About
      </h2>
      <div className="text-sm text-text-secondary">
        Made by <span className="text-text-primary font-medium">averatec0773</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        <div>
          <span className="text-text-secondary">My website: </span>
          <button
            type="button"
            onClick={() => void window.beatos.openExternal("https://averatec.studio")}
            className="text-accent underline hover:no-underline"
            aria-label="Open averatec.studio in browser"
          >
            averatec.studio
          </button>
        </div>
        <div>
          <span className="text-text-secondary">Project repo: </span>
          <button
            type="button"
            onClick={() => void window.beatos.openExternal("https://github.com/averatec0773/beatos")}
            className="text-accent underline hover:no-underline"
            aria-label="Open project repository on GitHub in browser"
          >
            github.com/averatec0773/beatos
          </button>
        </div>
      </div>
    </section>
  );
}

export function SettingsPanel(): React.JSX.Element {
  return (
    <main className="beatos-scroll flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-text-secondary text-sm mb-8">
          Storage location and Source management.
        </p>
        <StorageSection />
        <SourcesSection />
        <ProducersSection />
        <AboutSection />
      </div>
    </main>
  );
}
