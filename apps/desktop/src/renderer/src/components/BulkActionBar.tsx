import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

export interface BulkAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  /** Dim the action (e.g. an AI action that needs setup before it works). */
  muted?: boolean;
  /** Native tooltip — used to explain a muted/gated action. */
  title?: string;
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
  const { t } = useTranslation();
  if (count < 2) return null;
  return (
    <div
      data-bulk-action-bar
      className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-subtle bg-bg-elevated/95 px-2.5 py-2 shadow-lg backdrop-blur-sm select-none"
    >
      <span className="shrink-0 whitespace-nowrap px-1.5 text-xs font-medium tabular-nums text-text-secondary">
        {t("bulkBar.selected", { count })}
      </span>
      <div className="h-4 w-px shrink-0 bg-border-subtle" />
      {/* Actions scroll horizontally when the panel is too narrow to fit them all,
          so the bar never gets clipped by the card's rounded edges. */}
      <div className="beatos-scroll flex min-w-0 items-center gap-1 overflow-x-auto">
        {actions.map((a) =>
          a.render ? (
            <React.Fragment key={a.key}>{a.render()}</React.Fragment>
          ) : (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              title={a.title}
              className={[
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs",
                a.variant === "danger"
                  ? "text-danger hover:bg-danger/10"
                  : a.muted
                    ? "text-text-tertiary hover:bg-bg-row-hover hover:text-text-secondary"
                    : "text-text-primary hover:bg-bg-row-hover",
              ].join(" ")}
            >
              {a.icon}
              {a.label}
            </button>
          ),
        )}
      </div>
      <div className="h-4 w-px shrink-0 bg-border-subtle" />
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 rounded p-1 text-text-tertiary hover:text-text-primary"
        aria-label={t("bulkBar.clearSelection")}
        title={t("bulkBar.clearEsc")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
