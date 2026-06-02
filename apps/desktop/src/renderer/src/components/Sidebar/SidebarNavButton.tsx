import React from "react";

import { useSidebarPanelStore } from "@/stores/sidebar-panel";

interface Props {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Trailing content (count / pill) — hidden when the sidebar is collapsed. */
  trailing?: React.ReactNode;
  /** Show a small dot on the icon when collapsed (e.g. pending approvals). */
  collapsedDot?: boolean;
  dataAttr?: string;
  ariaPressed?: boolean;
}

/**
 * Shared primary-nav row (All Beats / Trash / Approvals / Settings). Larger than
 * the old rows so it reads at the same weight as the playlist rows below, and
 * collapses to an icon-only, centered button when the sidebar is collapsed.
 */
export function SidebarNavButton({
  icon,
  label,
  active,
  onClick,
  trailing,
  collapsedDot = false,
  dataAttr,
  ariaPressed,
}: Props): React.JSX.Element {
  const collapsed = useSidebarPanelStore((s) => s.collapsed);
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      {...(ariaPressed != null ? { "aria-pressed": ariaPressed } : {})}
      {...(dataAttr ? { [dataAttr]: "" } : {})}
      className={[
        "w-full rounded-md flex items-center transition-colors",
        collapsed ? "justify-center py-2.5" : "px-3 py-2 gap-3 text-left text-[16px]",
        active ? "bg-bg-row-active text-accent" : "text-text-primary hover:bg-bg-row-hover",
      ].join(" ")}
    >
      <span className="relative shrink-0 flex items-center justify-center">
        {icon}
        {collapsed && collapsedDot && (
          <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-warning" />
        )}
      </span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && trailing}
    </button>
  );
}
