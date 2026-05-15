import React, { useEffect } from "react";
import { Folder, Plus, Check } from "lucide-react";

import { useLibraryStore } from "@/stores/library";
import { useWatcherStore } from "@/stores/watcher";
import { WatchFolderRow } from "@/components/WatchFolderRow";

export function SettingsPanel(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const list = useLibraryStore((s) => s.list);
  const init = useLibraryStore((s) => s.init);
  const switchTo = useLibraryStore((s) => s.switchTo);

  const folders = useWatcherStore((s) => s.folders);
  const refreshFolders = useWatcherStore((s) => s.refresh);
  const addFolder = useWatcherStore((s) => s.addFolder);
  const removeFolder = useWatcherStore((s) => s.remove);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  async function onAddLibrary(): Promise<void> {
    const picked = await window.beatos.openFolderDialog();
    if (!picked) return;
    await init(picked);
  }

  async function onAddWatchFolder(): Promise<void> {
    const picked = await window.beatos.openFolderDialog();
    if (!picked) return;
    try {
      await addFolder(picked);
      // FirstScanModal in AppShell renders the modal as soon as pendingScan is set.
    } catch (e) {
      alert(`Failed to add watch folder: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-text-secondary text-sm mb-8">Library and watch folder management. More options arrive in v0.1.0.</p>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Libraries</h2>
            <button
              onClick={onAddLibrary}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover text-sm"
            >
              <Plus size={14} /> New library
            </button>
          </div>
          <div className="divide-y divide-border-subtle border border-border-subtle rounded-md overflow-hidden">
            {list.length === 0 ? (
              <div className="px-4 py-3 text-text-tertiary text-sm">No libraries yet.</div>
            ) : (
              list.map((lib) => {
                const isActive = active?.root_path === lib.root_path;
                return (
                  <div key={lib.root_path} className="px-4 py-3 flex items-center gap-3 bg-bg-elevated">
                    <Folder size={16} className="text-text-tertiary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{lib.name}</div>
                      <div className="text-xs text-text-tertiary truncate">{lib.root_path}</div>
                    </div>
                    {isActive ? (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent-soft text-accent text-xs font-medium">
                        <Check size={12} /> Active
                      </div>
                    ) : (
                      <button onClick={() => switchTo(lib.root_path)} className="px-3 py-1 rounded-md border border-border-subtle text-sm hover:bg-bg-row-hover">
                        Switch
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Watch folders</h2>
            <button
              onClick={onAddWatchFolder}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover text-sm"
            >
              <Plus size={14} /> Add watch folder
            </button>
          </div>
          <p className="text-xs text-text-tertiary mb-3">
            BeatOS will auto-import new audio files dropped into these folders as draft tracks.
          </p>
          <div className="divide-y divide-border-subtle border border-border-subtle rounded-md overflow-hidden">
            {folders.length === 0 ? (
              <div className="px-4 py-3 text-text-tertiary text-sm">No watch folders configured.</div>
            ) : (
              folders.map((f) => (
                <WatchFolderRow key={f.id} folder={f} onRemove={() => removeFolder(f.id)} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
