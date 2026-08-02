import React from "react";
import { Loader2, Clock, CheckCircle2, XCircle, X } from "lucide-react";
// Terminal stages the Publish Center no longer treats as "live" (stops the
// fast poll + spinner). awaiting_* stay live (browser is held open).
import { useTranslation } from "react-i18next";

import type { PublishJobFull } from "@/api/publish";

const AWAITING = new Set(["awaiting_review", "awaiting_sms"]);

interface Props {
  job: PublishJobFull;
  title: string;
  onRepublish: (trackId: number) => void;
  /** When provided, shows a per-row delete (×) that removes this job record. */
  onDelete?: (jobId: string) => void;
}

export function LiveJobRow({ job, title, onRepublish, onDelete }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const stage = job.stage;
  const awaiting = AWAITING.has(stage);
  return (
    <div className="group flex items-center justify-between rounded-md border border-border-subtle bg-bg-elevated px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm text-text-primary">{title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          {awaiting ? (
            <span className="flex items-center gap-1 text-warning">
              <Clock size={12} />{" "}
              {stage === "awaiting_sms"
                ? t("publishCenter.waitingForSms")
                : t("publishCenter.waitingForReview")}
            </span>
          ) : stage === "done" ? (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 size={12} /> {t("publishCenter.published")}
            </span>
          ) : stage === "expired" ? (
            <span className="flex items-center gap-1 text-text-tertiary">
              <Clock size={12} /> {t("publishCenter.windowClosed")}
            </span>
          ) : stage === "failed" ? (
            <span className="flex items-center gap-1 text-danger">
              <XCircle size={12} /> {t("publishCenter.failedJob", { message: job.message })}
            </span>
          ) : stage === "staged" || stage === "claimed" ? (
            // Extension tickets: waiting on the browser extension, not the engine.
            <span className="flex items-center gap-1 text-warning">
              <Clock size={12} />{" "}
              {stage === "staged"
                ? t("publishDialog.stageStaged")
                : t("publishDialog.stageClaimed")}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-text-tertiary">
              <Loader2 size={12} className="animate-spin" /> {job.message || stage}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {stage === "done" && job.result?.url ? (
          <a
            href={job.result.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover"
          >
            {t("publishCenter.viewListing")}
          </a>
        ) : stage === "failed" || stage === "expired" ? (
          <button
            type="button"
            onClick={() => onRepublish(job.request.track_id)}
            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover"
          >
            {t("publishCenter.republish")}
          </button>
        ) : null}
        {onDelete && (
          <button
            type="button"
            aria-label={t("common.delete")}
            title={t("common.delete")}
            onClick={() => onDelete(job.job_id)}
            className="rounded-md p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-bg-row-hover hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
