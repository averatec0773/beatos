import React from "react";
import { Plus, Settings as SettingsIcon, Folder } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useLibraryStore } from "@/stores/library";

export function LibrarySidebar(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const init = useLibraryStore((s) => s.init);
  const location = useLocation();

  async function onNewLibrary(): Promise<void> {
    const picked = await window.beatos.openFolderDialog();
    if (!picked) return;
    await init(picked);
  }

  const isSettings = location.pathname === "/settings";

  return (
    <aside className="w-[240px] bg-bg-sidebar border-r border-border-subtle flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-text-primary">Library</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewLibrary}
            className="w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-row-hover"
            aria-label="New library"
          >
            <Plus size={16} />
          </button>
          <Link
            to="/settings"
            className={`w-7 h-7 flex items-center justify-center rounded-full hover:bg-bg-row-hover ${
              isSettings ? "text-text-primary" : "text-text-secondary"
            }`}
            aria-label="Settings"
          >
            <SettingsIcon size={16} />
          </Link>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 mt-2">
        <Link
          to="/"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm relative ${
            !isSettings
              ? "bg-bg-row-selected text-text-primary"
              : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
          }`}
        >
          {!isSettings && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
          )}
          <Folder size={16} />
          <span>All Beats</span>
        </Link>
      </nav>

      {active && (
        <div className="px-4 py-3 border-t border-border-subtle">
          <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
            Active
          </div>
          <div className="text-sm text-text-secondary truncate" title={active.root_path}>
            {active.name}
          </div>
        </div>
      )}
    </aside>
  );
}
