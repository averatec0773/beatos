import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { publishHistoryApi, type PublishAttempt } from "@/api/publish-history";
import { useToastStore } from "@/stores/toast";
import { PublishHistoryRow } from "@/components/PublishCenter/PublishHistoryRow";

const SECTION = "text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary";

interface Props {
  /** Optional narrowing to one track's attempts. */
  trackId?: number;
  /**
   * Bump to re-read history — the panel changes it when a live job reaches a
   * terminal stage. History is NOT live data, so there is no poll loop here.
   */
  reloadKey?: string;
}

/**
 * Past publish attempts with their per-field report. Deliberately NOT Pro-gated:
 * the attempts are catalog data the sidecar serves without the publish engine,
 * so a free build still sees what it published before the engine went away.
 */
export function PublishHistorySection({ trackId, reloadKey }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState<PublishAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    publishHistoryApi
      .list({ trackId, includeHidden })
      .then((r) => {
        if (!cancelled) setAttempts(r.attempts ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, includeHidden, reloadKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const toggleHidden = useCallback(
    (attempt: PublishAttempt) => {
      const next = !attempt.hidden;
      const prev = attempts;
      // Optimistic: with hidden rows off, a hidden row leaves the list; with
      // them on, it just flips its badge. Nothing is deleted server-side.
      setAttempts(
        includeHidden
          ? prev.map((a) => (a.id === attempt.id ? { ...a, hidden: next } : a))
          : prev.filter((a) => a.id !== attempt.id),
      );
      void publishHistoryApi.setHidden(attempt.id, next).catch(() => {
        setAttempts(prev);
        useToastStore.getState().show("error", t("publishCenter.history.hideFailed"));
      });
    },
    [attempts, includeHidden, t],
  );

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className={SECTION}>{t("publishCenter.history.title")}</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={includeHidden}
            onClick={() => setIncludeHidden((v) => !v)}
            className={`rounded-md px-2 py-0.5 text-xs hover:bg-bg-row-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${
              includeHidden ? "text-text-secondary" : "text-text-tertiary"
            }`}
          >
            {t("publishCenter.history.showHidden")}
          </button>
          <button
            type="button"
            aria-label={t("publishCenter.refresh")}
            title={t("publishCenter.refresh")}
            onClick={reload}
            className="rounded-md p-1 text-text-tertiary hover:bg-bg-row-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-text-tertiary">{t("publishCenter.history.loading")}</div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs text-danger">
          <span>{t("publishCenter.history.loadFailed")}</span>
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-border-subtle px-2 py-0.5 text-text-secondary hover:bg-bg-row-hover"
          >
            {t("publishCenter.history.retry")}
          </button>
        </div>
      ) : attempts.length === 0 ? (
        <div className="text-xs text-text-tertiary">
          {includeHidden
            ? t("publishCenter.history.empty")
            : t("publishCenter.history.emptyVisible")}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attempts.map((a) => (
            <PublishHistoryRow key={a.id} attempt={a} onToggleHidden={toggleHidden} />
          ))}
        </div>
      )}
    </div>
  );
}
