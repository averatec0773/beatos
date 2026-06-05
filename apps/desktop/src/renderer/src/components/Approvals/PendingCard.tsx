import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import type { PendingToken } from "@/hooks/use-pending-tokens";

interface Preview {
  headline: string;
  sample: string[];
  warnings: string[];
  risk?: "destructive";
}

interface Props {
  token: PendingToken;
  onApprove: (token: string) => void | Promise<void>;
  onReject: (token: string) => void | Promise<void>;
}

function untilSeconds(epochSec: number): string {
  const delta = Math.max(0, Math.floor(epochSec - Date.now() / 1000));
  const m = Math.floor(delta / 60);
  const s = delta % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function relativeSeconds(epochSec: number): string {
  const delta = Math.floor(Date.now() / 1000 - epochSec);
  if (delta < 60) return `${delta} sec ago`;
  return `${Math.floor(delta / 60)} min ago`;
}

function extractPreview(payload: Record<string, unknown>): Preview | null {
  const p = payload.preview;
  if (!p || typeof p !== "object") return null;
  const obj = p as Record<string, unknown>;
  if (
    typeof obj.headline !== "string" ||
    !Array.isArray(obj.sample) ||
    !obj.sample.every((x) => typeof x === "string") ||
    !Array.isArray(obj.warnings) ||
    !obj.warnings.every((x) => typeof x === "string")
  ) {
    return null;
  }
  return {
    headline: obj.headline,
    sample: obj.sample as string[],
    warnings: obj.warnings as string[],
    risk: obj.risk === "destructive" ? "destructive" : undefined,
  };
}

function fullItemCount(payload: Record<string, unknown>): number {
  if (Array.isArray(payload.ids)) return payload.ids.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.track_ids)) return payload.track_ids.length;
  return 0;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

function renderExpandedItems(payload: Record<string, unknown>): string[] {
  const ids = payload.ids ?? payload.track_ids;
  if (Array.isArray(ids)) return ids.map((id) => `#${String(id)}`);
  if (Array.isArray(payload.items))
    return payload.items.map((it, i) => {
      const obj = it as Record<string, unknown>;
      // attach_assets: {track_id, role, path}
      if (
        typeof obj.track_id === "number" &&
        typeof obj.role === "string" &&
        typeof obj.path === "string"
      ) {
        return `#${obj.track_id} ${obj.role}: ${basename(obj.path)}`;
      }
      // detach_assets: {track_id, role}
      if (typeof obj.track_id === "number" && typeof obj.role === "string") {
        return `#${obj.track_id} ${obj.role}`;
      }
      // create_tracks: {title, ...}
      if (typeof obj.title === "string") return `#${i + 1} ${obj.title}`;
      return `#${i + 1}`;
    });
  return [];
}

export function PendingCard({ token, onApprove, onReject }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const preview = extractPreview(token.payload);
  const [expanded, setExpanded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!preview) {
    // Legacy: create_list and any other tool that doesn't bake preview.
    return (
      <li className="rounded border border-border-subtle bg-bg-elevated p-3 text-sm">
        <div className="font-mono text-xs">
          {token.tool_name} {JSON.stringify(token.payload)}
        </div>
        <div className="mt-1 text-xs text-text-tertiary">
          Requested {relativeSeconds(token.created_at)} · expires in{" "}
          {untilSeconds(token.expires_at)}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void onApprove(token.token)}
            className="rounded border border-success px-3 py-1 text-success hover:bg-success/10"
          >
            {t("approvals.approve")}
          </button>
          <button
            type="button"
            onClick={() => void onReject(token.token)}
            className="rounded border border-danger px-3 py-1 text-danger hover:bg-danger/10"
          >
            {t("approvals.reject")}
          </button>
        </div>
      </li>
    );
  }

  const isDestructive = preview.risk === "destructive";
  const total = fullItemCount(token.payload);
  const expandedItems = expanded ? renderExpandedItems(token.payload) : null;
  const approveDisabled = isDestructive && !confirmed;

  return (
    <li
      className={
        "rounded p-3 text-sm " +
        (isDestructive
          ? "border border-danger bg-danger/5"
          : "border border-border-subtle bg-bg-elevated")
      }
    >
      <div className={"font-medium " + (isDestructive ? "text-danger" : "")}>
        {preview.headline}
      </div>
      {isDestructive && <div className="mt-1 text-xs text-danger">{t("approvals.cannotBeUndone")}</div>}

      <div className="mt-2 text-xs text-text-secondary">{preview.sample.join(" · ")}</div>

      {total > preview.sample.length && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs underline text-text-tertiary"
        >
          {expanded ? t("approvals.hide") : t("approvals.showAll", { count: total })}
        </button>
      )}
      {expandedItems && (
        <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-text-tertiary">
          {expandedItems.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      )}

      {preview.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-warning">
          {preview.warnings.map((w, i) => (
            <li key={i}>
              <span aria-hidden="true">⚠ </span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 text-xs text-text-tertiary">
        Requested {relativeSeconds(token.created_at)} · expires in {untilSeconds(token.expires_at)}
      </div>

      {isDestructive && (
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>{t("approvals.iUnderstand")}</span>
        </label>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void onApprove(token.token)}
          disabled={approveDisabled}
          className={
            "rounded border px-3 py-1 " +
            (approveDisabled
              ? "border-border-subtle text-text-tertiary cursor-not-allowed"
              : "border-success text-success hover:bg-success/10")
          }
        >
          {t("approvals.approve")}
        </button>
        <button
          type="button"
          onClick={() => void onReject(token.token)}
          className="rounded border border-danger px-3 py-1 text-danger hover:bg-danger/10"
        >
          {t("approvals.reject")}
        </button>
      </div>
    </li>
  );
}
