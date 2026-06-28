import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AgentAction, AgentActionStatus } from "@/hooks/use-agent-actions";
import { useAppLanguageStore } from "@/stores/app-language";
import type { AppLanguage } from "@/i18n/resources";
import { formatRelativeTime } from "@/i18n/format";

interface Props {
  actions: AgentAction[];
  onDelete?: (id: number) => void;
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

export function ActivityList({ actions, onDelete }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const lang = useAppLanguageStore((s) => s.language);

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-text-secondary">
        {t("approvals.recent", { count: actions.length })}
      </h2>
      <ul className="space-y-1">
        {actions.map((action) => (
          <li
            key={action.id}
            className="group flex items-center gap-3 rounded-md px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-row-hover"
          >
            <span className={`text-base ${statusClass(action.status)}`}>
              {statusGlyph(action.status)}
            </span>
            <span className="truncate">{action.summary.headline || action.tool_name}</span>
            <span className="ml-auto shrink-0 text-text-tertiary">
              {formatActedAt(lang, action.ts)}
            </span>
            {onDelete && (
              <button
                type="button"
                aria-label={t("common.delete")}
                title={t("common.delete")}
                onClick={() => onDelete(action.id)}
                className="shrink-0 rounded-md p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-bg-row-active hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent group-hover:opacity-100"
              >
                <X size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
