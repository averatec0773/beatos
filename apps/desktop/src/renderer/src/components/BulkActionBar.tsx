import React from "react";
import { X } from "lucide-react";

export interface BulkAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  // Optional render override for actions that need a popover/menu trigger
  // (e.g. "Add to list" needs to host a Popover anchored to the button itself).
  render?: () => React.ReactNode;
}

interface Props {
  /** Visible when count >= 2 (one selected item is treated as a single-row interaction). */
  count: number;
  actions: BulkAction[];
  onClear: () => void;
}

/**
 * Bottom-anchored bar that surfaces bulk operations when the user has
 * multi-selected rows. Positioned absolute inside the panel section (its
 * parent must be `position: relative`) so it floats above the table without
 * pushing rows up. The 2-row threshold is intentional — a single selection
 * is already the default "active row" state and doesn't need its own
 * action surface.
 */
export function BulkActionBar({ count, actions, onClear }: Props): React.JSX.Element | null {
  if (count < 2) return null;
  return (
    <div
      data-bulk-action-bar
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-bg-elevated/95 border border-border-subtle shadow-lg backdrop-blur-sm select-none whitespace-nowrap"
    >
      <span className="text-xs text-text-secondary font-medium tabular-nums px-2 whitespace-nowrap">
        {count} selected
      </span>
      <div className="h-4 w-px bg-border-subtle" />
      {actions.map((a) =>
        a.render ? (
          <React.Fragment key={a.key}>{a.render()}</React.Fragment>
        ) : (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            className={
              a.variant === "danger"
                ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-danger hover:bg-danger/10 whitespace-nowrap"
                : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-text-primary hover:bg-bg-row-hover whitespace-nowrap"
            }
          >
            {a.icon}
            {a.label}
          </button>
        ),
      )}
      <div className="h-4 w-px bg-border-subtle" />
      <button
        type="button"
        onClick={onClear}
        className="text-text-tertiary hover:text-text-primary p-1 rounded"
        aria-label="Clear selection"
        title="Clear (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
