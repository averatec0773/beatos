import React from "react";
import { Code2 } from "lucide-react";

import { useSidebarPanelStore } from "@/stores/sidebar-panel";

export function SidebarFooter(): React.JSX.Element {
  const collapsed = useSidebarPanelStore((s) => s.collapsed);
  // Mirror the icon + gap layout of the nav rows so the handle's text column
  // lines up with theirs; collapses to a centered icon.
  return (
    <button
      type="button"
      onClick={() => void window.beatos.openExternal("https://github.com/averatec0773")}
      className={[
        "w-full rounded-md text-[13px] flex items-center text-text-tertiary hover:text-text-primary hover:bg-bg-row-hover transition-colors",
        collapsed ? "justify-center py-2" : "px-3 py-1.5 text-left gap-2",
      ].join(" ")}
      aria-label="Open developer GitHub profile in browser"
      title="Developer — open GitHub profile"
    >
      <Code2 size={collapsed ? 18 : 14} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">@averatec0773</span>}
    </button>
  );
}
