import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { useSourceStore } from "@/stores/sources";

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

function AboutSection(): React.JSX.Element {
  return (
    <section className="mt-10 pt-6 border-t border-border-subtle">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-3">
        About
      </h2>
      <div className="text-sm text-text-secondary">
        Made by <span className="text-text-primary font-medium">averatec0773</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <button
          type="button"
          onClick={() => void window.beatos.openExternal("https://averatec.studio")}
          className="text-accent hover:underline text-left"
        >
          averatec.studio
        </button>
        <button
          type="button"
          onClick={() => void window.beatos.openExternal("https://github.com/averatec0773/beatos")}
          className="text-accent hover:underline text-left"
        >
          View on GitHub
        </button>
      </div>
    </section>
  );
}

export function SettingsPanel(): React.JSX.Element {
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-text-secondary text-sm mb-8">
          Storage location and Source management.
        </p>
        <StorageSection />
        <SourcesSection />
        <AboutSection />
      </div>
    </main>
  );
}
