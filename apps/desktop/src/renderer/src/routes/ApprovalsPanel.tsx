import React from "react";
import { useTranslation } from "react-i18next";

import { useAgentActions } from "@/hooks/use-agent-actions";
import { ActivityList } from "@/components/Approvals/ActivityList";

export function ApprovalsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { actions } = useAgentActions();

  return (
    <main className="beatos-scroll flex-1 overflow-y-auto p-8 rounded-xl beatos-card">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">{t("approvals.title")}</h1>

        {actions.length === 0 ? (
          <div className="rounded border border-border-subtle bg-bg-elevated p-6 text-sm text-text-secondary">
            {t("approvals.empty")}
          </div>
        ) : (
          <ActivityList actions={actions} />
        )}
      </div>
    </main>
  );
}
