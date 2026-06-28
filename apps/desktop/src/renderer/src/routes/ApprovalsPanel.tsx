import React from "react";
import { useTranslation } from "react-i18next";

import { useAgentActions } from "@/hooks/use-agent-actions";
import { ActivityList } from "@/components/Approvals/ActivityList";
import { confirmDialog } from "@/stores/confirm-dialog";
import { platform } from "@/platform";

export function ApprovalsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { actions, deleteAction, clearAll } = useAgentActions();

  async function handleClearAll(): Promise<void> {
    const ok = await confirmDialog({
      title: t("common.clearAll"),
      message: t("approvals.clearConfirm"),
      variant: "danger",
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (ok) await clearAll();
  }

  return (
    <main className="beatos-scroll flex-1 overflow-y-auto p-8 rounded-xl beatos-card">
      <div className="max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("approvals.title")}</h1>
          {actions.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearAll()}
              className="shrink-0 rounded-md px-2.5 py-1 text-xs text-text-tertiary hover:bg-bg-row-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
            >
              {t("common.clearAll")}
            </button>
          )}
        </div>

        {actions.length === 0 ? (
          <div className="rounded border border-border-subtle bg-bg-elevated p-6 text-sm text-text-secondary">
            {/* MCP client setup (Settings → AI Integration) is desktop-only, so the
                web build points at the desktop app instead of a missing section. */}
            {t(platform.kind === "web" ? "approvals.emptyWeb" : "approvals.empty")}
          </div>
        ) : (
          <ActivityList actions={actions} onDelete={(id) => void deleteAction(id)} />
        )}
      </div>
    </main>
  );
}
