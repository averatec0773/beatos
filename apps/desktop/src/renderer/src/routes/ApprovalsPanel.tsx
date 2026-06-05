import React from "react";
import { useTranslation } from "react-i18next";

import { usePendingTokens } from "@/hooks/use-pending-tokens";
import { usePendingTokensHistory } from "@/hooks/use-pending-tokens-history";
import { PendingList } from "@/components/Approvals/PendingList";
import { HistoryList } from "@/components/Approvals/HistoryList";

export function ApprovalsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens: pending, approve, reject } = usePendingTokens();
  const { tokens: history } = usePendingTokensHistory();

  const empty = pending.length === 0 && history.length === 0;

  return (
    <main className="beatos-scroll flex-1 overflow-y-auto p-8 rounded-xl beatos-card">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">{t("approvals.title")}</h1>

        {empty ? (
          <div className="rounded border border-border-subtle bg-bg-elevated p-6 text-sm text-text-secondary">
            {t("approvals.empty")}
          </div>
        ) : (
          <>
            <PendingList tokens={pending} onApprove={approve} onReject={reject} />
            <HistoryList tokens={history} />
          </>
        )}
      </div>
    </main>
  );
}
