import React from "react";
import { useTranslation } from "react-i18next";

import type { AgentAction, AgentActionStatus } from "@/hooks/use-agent-actions";
import { useAppLanguageStore } from "@/stores/app-language";
import type { AppLanguage } from "@/i18n/resources";
import { formatRelativeTime } from "@/i18n/format";

interface Props {
  actions: AgentAction[];
}

function formatActedAt(lang: AppLanguage, tsSec: number): string {
  return formatRelativeTime(lang, tsSec * 1000, Date.now());
}

function statusGlyph(status: AgentActionStatus): string {
  if (status === "applied") return "✓";
  if (status === "failed") return "✗";
  return "⊘";
}

function statusClass(status: AgentActionStatus): string {
  if (status === "applied") return "text-success";
  if (status === "failed") return "text-danger";
  return "text-text-tertiary";
}

export function ActivityList({ actions }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const lang = useAppLanguageStore((s) => s.language);

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-text-secondary">
        {t("approvals.recent", { count: actions.length })}
      </h2>
      <ul className="space-y-1">
        {actions.map((action, i) => (
          <li
            key={`${action.ts}-${i}`}
            className="flex items-center gap-3 px-3 py-1.5 text-xs text-text-secondary"
          >
            <span className={`text-base ${statusClass(action.status)}`}>
              {statusGlyph(action.status)}
            </span>
            <span className="truncate">{action.summary.headline || action.tool_name}</span>
            <span className="ml-auto shrink-0 text-text-tertiary">
              {formatActedAt(lang, action.ts)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
