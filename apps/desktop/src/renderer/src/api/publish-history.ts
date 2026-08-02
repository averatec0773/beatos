import { apiGet, apiPost } from "./client";

/** Terminal outcome of a recorded publish attempt. `""` = still running. */
export type PublishAttemptOutcome = "" | "success" | "dry_run" | "expired" | "failed";

/** Per-field result recorded by the publish engine while filling a form. */
export type PublishFieldOutcome = "filled" | "skipped" | "needs-user" | "failed";

export interface PublishAttemptCounts {
  filled: number;
  skipped: number;
  needs_user: number;
  failed: number;
}

export interface PublishAttempt {
  id: number;
  job_id: string;
  track_id: number;
  track_title: string;
  platform: string;
  account: string;
  mode: "engine" | "extension";
  dry_run: boolean;
  outcome: PublishAttemptOutcome;
  stage: string;
  message: string;
  listing_url: string | null;
  hidden: boolean;
  created_at: string;
  finished_at: string | null;
  counts: PublishAttemptCounts;
}

export interface PublishFieldReport {
  page: string;
  field_key: string;
  label: string;
  outcome: PublishFieldOutcome;
  source: string;
  value: string;
  reason: string;
  duration_ms: number | null;
  updated_at: string;
}

export interface PublishHistoryQuery {
  trackId?: number;
  limit?: number;
  includeHidden?: boolean;
}

export const publishHistoryApi = {
  list(q: PublishHistoryQuery = {}): Promise<{ attempts: PublishAttempt[] }> {
    const params = new URLSearchParams();
    if (q.trackId != null) params.set("track_id", String(q.trackId));
    if (q.limit != null) params.set("limit", String(q.limit));
    if (q.includeHidden) params.set("include_hidden", "true");
    const qs = params.toString();
    return apiGet<{ attempts: PublishAttempt[] }>(`/api/publish/history${qs ? `?${qs}` : ""}`);
  },
  detail(attemptId: number): Promise<{
    attempt: PublishAttempt;
    field_reports: PublishFieldReport[];
  }> {
    return apiGet(`/api/publish/history/${attemptId}`);
  },
  /**
   * Soft-hide (or restore) an attempt. The record is KEPT — this only flips a
   * flag so the default list stops showing it. Mutating → apiPost attaches the
   * local API token, like every other write in api/publish.ts.
   */
  setHidden(attemptId: number, hidden: boolean): Promise<{ ok: boolean }> {
    return apiPost<{ ok: boolean }>(`/api/publish/history/${attemptId}/hide`, { hidden });
  },
};
