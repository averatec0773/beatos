import React from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useLibraryStore } from "@/stores/library";
import { LibrarySwitcher } from "@/components/LibrarySwitcher";
import { ListSidebarSection } from "@/components/ListSidebarSection";

export function LibrarySidebar(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const location = useLocation();

  return (
    <aside className="w-[240px] bg-bg-sidebar border-r border-border-subtle flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <LibrarySwitcher />
      </div>

      <ListSidebarSection />

      <div className="px-2 py-2 border-t border-border-subtle">
        <Link
          to="/settings"
          className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm ${
            location.pathname === "/settings"
              ? "bg-bg-row-selected text-text-primary"
              : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
          }`}
        >
          <SettingsIcon size={14} />
          <span>Settings</span>
        </Link>
      </div>

      {active && (
        <div className="px-4 py-3 border-t border-border-subtle">
          <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
            Active
          </div>
          <div className="text-sm text-text-secondary truncate" title={active.root_path}>
            {active.root_path.split("/").pop() ?? active.root_path}
          </div>
        </div>
      )}
    </aside>
  );
}
