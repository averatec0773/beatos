import React from "react";
import { Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";

import type { PublishJobFull } from "@/api/publish";

const AWAITING = new Set(["awaiting_review", "awaiting_sms"]);

interface Props {
  job: PublishJobFull;
  title: string;
  onRepublish: (trackId: number) => void;
}

export function LiveJobRow({ job, title, onRepublish }: Props): React.JSX.Element {
  const stage = job.stage;
  const awaiting = AWAITING.has(stage);
  return (
    <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-elevated px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm text-text-primary">{title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          {awaiting ? (
            <span className="flex items-center gap-1 text-warning">
              <Clock size={12} /> Waiting for you — finish in the open browser (
              {stage === "awaiting_sms" ? "enter SMS → submit" : "next → sign → submit"})
            </span>
          ) : stage === "done" ? (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 size={12} /> Published
            </span>
          ) : stage === "failed" ? (
            <span className="flex items-center gap-1 text-error">
              <XCircle size={12} /> Failed — {job.message}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-text-tertiary">
              <Loader2 size={12} className="animate-spin" /> {job.message || stage}
            </span>
          )}
        </div>
      </div>
      {stage === "done" && job.result?.url ? (
        <a
          href={job.result.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover"
        >
          View listing
        </a>
      ) : stage === "failed" ? (
        <button
          type="button"
          onClick={() => onRepublish(job.request.track_id)}
          className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover"
        >
          Republish
        </button>
      ) : null}
    </div>
  );
}
