import React from "react";

import type { HistoryToken } from "@/hooks/use-pending-tokens-history";

interface Props {
  tokens: HistoryToken[];
}

function formatPayload(toolName: string, payload: Record<string, unknown>): string {
  if (toolName === "create_list" && typeof payload.name === "string") {
    return `"${payload.name}"`;
  }
  return JSON.stringify(payload);
}

function relativeSeconds(epochSec: number): string {
  const delta = Math.floor(Date.now() / 1000 - epochSec);
  if (delta < 60) return `${delta} sec ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  return `${Math.floor(delta / 3600)} hr ago`;
}

function statusGlyph(status: HistoryToken["status"]): string {
  if (status === "consumed") return "✓";
  if (status === "rejected") return "✗";
  return "⌛";
}

function statusClass(status: HistoryToken["status"]): string {
  if (status === "consumed") return "text-success";
  if (status === "rejected") return "text-danger";
  return "text-text-tertiary";
}

export function HistoryList({ tokens }: Props): React.JSX.Element | null {
  if (tokens.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Recent ({tokens.length})</h2>
      <ul className="space-y-1">
        {tokens.map((t) => {
          const when = t.consumed_at ?? t.expires_at;
          return (
            <li
              key={t.token}
              className="flex items-center gap-3 px-3 py-1.5 text-xs text-text-secondary"
            >
              <span className={`text-base ${statusClass(t.status)}`}>{statusGlyph(t.status)}</span>
              <span className="font-mono">
                {t.tool_name} {formatPayload(t.tool_name, t.payload)}
              </span>
              <span className="text-text-tertiary ml-auto">{relativeSeconds(when)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
