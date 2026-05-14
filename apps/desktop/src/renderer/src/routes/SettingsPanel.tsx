import React from "react";
import { Folder, Plus, Check } from "lucide-react";

import { useLibraryStore } from "@/stores/library";

export function SettingsPanel(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const list = useLibraryStore((s) => s.list);
  const init = useLibraryStore((s) => s.init);
  const switchTo = useLibraryStore((s) => s.switchTo);

  async function onAdd(): Promise<void> {
    const picked = await window.beatos.openFolderDialog();
    if (!picked) return;
    await init(picked);
  }

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-text-secondary text-sm mb-6">
          Library management. More options arrive in v0.1.0.
        </p>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Libraries</h2>
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover text-sm"
            >
              <Plus size={14} />
              New library
            </button>
          </div>

          <div className="divide-y divide-border-subtle border border-border-subtle rounded-md overflow-hidden">
            {list.length === 0 ? (
              <div className="px-4 py-3 text-text-tertiary text-sm">No libraries yet.</div>
            ) : (
              list.map((lib) => {
                const isActive = active?.root_path === lib.root_path;
                return (
                  <div
                    key={lib.root_path}
                    className="px-4 py-3 flex items-center gap-3 bg-bg-elevated"
                  >
                    <Folder size={16} className="text-text-tertiary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{lib.name}</div>
                      <div className="text-xs text-text-tertiary truncate">{lib.root_path}</div>
                    </div>
                    {isActive ? (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent-soft text-accent text-xs font-medium">
                        <Check size={12} />
                        Active
                      </div>
                    ) : (
                      <button
                        onClick={() => switchTo(lib.root_path)}
                        className="px-3 py-1 rounded-md border border-border-subtle text-sm hover:bg-bg-row-hover"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
