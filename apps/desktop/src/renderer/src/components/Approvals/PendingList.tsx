import React from "react";

import type { PendingToken } from "@/hooks/use-pending-tokens";

interface Props {
  tokens: PendingToken[];
  onApprove: (token: string) => void | Promise<void>;
  onReject: (token: string) => void | Promise<void>;
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
  return `${Math.floor(delta / 60)} min ago`;
}

function untilSeconds(epochSec: number): string {
  const delta = Math.max(0, Math.floor(epochSec - Date.now() / 1000));
  const m = Math.floor(delta / 60);
  const s = delta % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PendingList({ tokens, onApprove, onReject }: Props): React.JSX.Element | null {
  if (tokens.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-medium text-warning">
        ⚠ Pending ({tokens.length})
      </h2>
      <ul className="space-y-2">
        {tokens.map((t) => (
          <li key={t.token} className="rounded border border-border-subtle bg-bg-elevated p-3 text-sm">
            <div className="font-mono text-xs">
              {t.tool_name} {formatPayload(t.tool_name, t.payload)}
            </div>
            <div className="mt-1 text-xs text-text-tertiary">
              Requested {relativeSeconds(t.created_at)} · expires in {untilSeconds(t.expires_at)}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void onApprove(t.token)}
                className="rounded border border-success px-3 py-1 text-success hover:bg-success/10"
              >
                ✓ Approve
              </button>
              <button
                type="button"
                onClick={() => void onReject(t.token)}
                className="rounded border border-danger px-3 py-1 text-danger hover:bg-danger/10"
              >
                ✗ Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
