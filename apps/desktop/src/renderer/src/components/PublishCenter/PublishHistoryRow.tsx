import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  publishHistoryApi,
  type PublishAttempt,
  type PublishFieldOutcome,
  type PublishFieldReport,
} from "@/api/publish-history";
import { formatRelativeTime } from "@/i18n/format";
import type { AppLanguage } from "@/i18n/resources";
import { useAppLanguageStore } from "@/stores/app-language";

// Module scope so Date.now() is not called during render (react-hooks/purity),
// mirroring TrashPanel's helper. Unparseable timestamps fall back to the raw
// string rather than rendering "Invalid Date".
function formatWhen(lang: AppLanguage, iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? iso : formatRelativeTime(lang, ms, Date.now());
}

/** needs-user / failed first — this list exists to answer "what did I have to fix myself?". */
const ATTENTION: ReadonlyArray<PublishFieldOutcome> = ["needs-user", "failed"];

function fieldRank(outcome: PublishFieldOutcome): number {
  if (outcome === "needs-user") return 0;
  if (outcome === "failed") return 1;
  if (outcome === "skipped") return 2;
  return 3;
}

interface Props {
  attempt: PublishAttempt;
  /** Toggles the soft hidden flag. The record is kept either way. */
  onToggleHidden: (attempt: PublishAttempt) => void;
}

export function PublishHistoryRow({ attempt, onToggleHidden }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const lang = useAppLanguageStore((s) => s.language);
  const [expanded, setExpanded] = useState(false);
  const [reports, setReports] = useState<PublishFieldReport[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  // Fetch the field report on first expand only — history is not live data, and
  // collapsing/re-expanding must not re-hit the sidecar. The request lives in the
  // click handler (not an effect) so a collapse can't cancel an in-flight read.
  const requested = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const loadDetail = useCallback(async (): Promise<void> => {
    if (requested.current) return;
    requested.current = true;
    setDetailLoading(true);
    setDetailError(false);
    try {
      const r = await publishHistoryApi.detail(attempt.id);
      if (alive.current) setReports(r.field_reports ?? []);
    } catch {
      if (alive.current) setDetailError(true);
      requested.current = false; // allow a retry via re-expand
    } finally {
      if (alive.current) setDetailLoading(false);
    }
  }, [attempt.id]);

  function toggleExpanded(): void {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadDetail();
  }

  const sortedReports = useMemo(
    () =>
      reports ? [...reports].sort((a, b) => fieldRank(a.outcome) - fieldRank(b.outcome)) : null,
    [reports],
  );

  const title = attempt.track_title || t("publishCenter.trackFallback", { id: attempt.track_id });
  const meta = [attempt.platform, attempt.account].filter(Boolean).join(" · ");

  return (
    <div className="rounded-md border border-border-subtle bg-bg-elevated">
      <div className="group flex items-start gap-2 px-2 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={
            expanded ? t("publishCenter.history.collapse") : t("publishCenter.history.expand")
          }
          onClick={toggleExpanded}
          className="mt-0.5 shrink-0 rounded-md p-0.5 text-text-tertiary hover:bg-bg-row-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm text-text-primary">{title}</span>
            <span className="rounded border border-border-subtle px-1 py-px text-[10px] uppercase tracking-wide text-text-tertiary">
              {attempt.mode === "extension"
                ? t("publishCenter.history.modeExtension")
                : t("publishCenter.history.modeEngine")}
            </span>
            {attempt.hidden && (
              <span className="rounded border border-border-subtle px-1 py-px text-[10px] uppercase tracking-wide text-text-tertiary">
                {t("publishCenter.history.hiddenBadge")}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <OutcomeChip attempt={attempt} />
            <span className="text-text-tertiary">
              {meta}
              {meta && " · "}
              {formatWhen(lang, attempt.created_at)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {attempt.listing_url && (
            <a
              href={attempt.listing_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover"
            >
              {t("publishCenter.viewListing")}
            </a>
          )}
          <button
            type="button"
            aria-label={
              attempt.hidden
                ? t("publishCenter.history.unhideRow")
                : t("publishCenter.history.hideRow")
            }
            title={
              attempt.hidden
                ? t("publishCenter.history.unhideRow")
                : t("publishCenter.history.hideRow")
            }
            onClick={() => onToggleHidden(attempt)}
            className="rounded-md p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-bg-row-hover hover:text-text-secondary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent group-hover:opacity-100"
          >
            {attempt.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle px-3 py-2">
          <div className="mb-1.5 text-xs text-text-tertiary">
            {t("publishCenter.history.counts", {
              filled: attempt.counts.filled,
              skipped: attempt.counts.skipped,
              needsUser: attempt.counts.needs_user,
              failed: attempt.counts.failed,
            })}
          </div>
          {detailLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Loader2 size={12} className="animate-spin" />{" "}
              {t("publishCenter.history.detailLoading")}
            </div>
          ) : detailError ? (
            <div className="text-xs text-danger">{t("publishCenter.history.detailFailed")}</div>
          ) : sortedReports && sortedReports.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {sortedReports.map((r) => (
                <FieldReportRow key={`${r.page}:${r.field_key}`} report={r} />
              ))}
            </ul>
          ) : (
            <div className="text-xs text-text-tertiary">{t("publishCenter.history.noFields")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function OutcomeChip({ attempt }: { attempt: PublishAttempt }): React.JSX.Element {
  const { t } = useTranslation();
  if (attempt.outcome === "success")
    return (
      <span className="flex items-center gap-1 text-success">
        <CheckCircle2 size={12} /> {t("publishCenter.published")}
      </span>
    );
  if (attempt.outcome === "dry_run")
    return (
      <span className="flex items-center gap-1 text-text-secondary">
        <FlaskConical size={12} /> {t("publishCenter.history.dryRun")}
      </span>
    );
  if (attempt.outcome === "expired")
    return (
      <span className="flex items-center gap-1 text-text-tertiary">
        <Clock size={12} /> {t("publishCenter.windowClosed")}
      </span>
    );
  if (attempt.outcome === "failed")
    return (
      <span className="flex items-center gap-1 text-danger">
        <XCircle size={12} />{" "}
        {attempt.message
          ? t("publishCenter.failedJob", { message: attempt.message })
          : t("publishCenter.history.failed")}
      </span>
    );
  // outcome "" — the job never reached a terminal stage in this record.
  return (
    <span className="flex items-center gap-1 text-text-tertiary">
      <Loader2 size={12} /> {t("publishCenter.history.stillLive")}
    </span>
  );
}

function FieldReportRow({ report }: { report: PublishFieldReport }): React.JSX.Element {
  const { t } = useTranslation();
  const attention = ATTENTION.includes(report.outcome);
  const label = report.label || report.field_key;
  return (
    <li
      className={`rounded border-l-2 px-2 py-1 text-xs ${
        report.outcome === "needs-user"
          ? "border-warning bg-warning/5"
          : report.outcome === "failed"
            ? "border-danger bg-danger/5"
            : "border-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <FieldOutcomeChip outcome={report.outcome} />
        <span className={attention ? "text-text-primary" : "text-text-secondary"}>{label}</span>
        <span className="text-text-tertiary">{report.field_key}</span>
        {report.page && (
          <span className="text-text-tertiary">
            {t("publishCenter.history.onPage", { page: report.page })}
          </span>
        )}
      </div>
      {(report.source || report.value || report.reason) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-text-tertiary">
          {report.source && (
            <span>{t("publishCenter.history.source", { source: report.source })}</span>
          )}
          {report.value && (
            <span className="truncate">
              {t("publishCenter.history.value", { value: report.value })}
            </span>
          )}
          {report.reason && <span>{report.reason}</span>}
        </div>
      )}
    </li>
  );
}

function FieldOutcomeChip({ outcome }: { outcome: PublishFieldOutcome }): React.JSX.Element {
  const { t } = useTranslation();
  if (outcome === "needs-user")
    return (
      <span className="flex items-center gap-1 font-medium text-warning">
        <AlertTriangle size={11} /> {t("publishCenter.history.fieldNeedsUser")}
      </span>
    );
  if (outcome === "failed")
    return (
      <span className="flex items-center gap-1 font-medium text-danger">
        <XCircle size={11} /> {t("publishCenter.history.fieldFailed")}
      </span>
    );
  if (outcome === "skipped")
    return (
      <span className="flex items-center gap-1 text-text-tertiary">
        <MinusCircle size={11} /> {t("publishCenter.history.fieldSkipped")}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-success">
      <CheckCircle2 size={11} /> {t("publishCenter.history.fieldFilled")}
    </span>
  );
}
