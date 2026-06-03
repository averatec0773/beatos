import { apiGet, apiPost } from "./client";

export interface PublishJob {
  job_id: string;
  stage: string;
  message: string;
  result?: { ok: boolean; url?: string; error?: string };
}

export interface PublishCreateBody {
  track_id: number;
  platform: string;
  audio_asset_id: number;
  cover_asset_id?: number;
  account?: string;
  dry_run?: boolean;
}

export const publishApi = {
  create(body: PublishCreateBody): Promise<{ job_id: string }> {
    return apiPost<{ job_id: string }>(`/api/publish`, body);
  },
  status(jobId: string): Promise<PublishJob> {
    return apiGet<PublishJob>(`/api/publish/${encodeURIComponent(jobId)}`);
  },
  sessions(): Promise<{ sessions: Record<string, boolean> }> {
    return apiGet<{ sessions: Record<string, boolean> }>(`/api/publish/sessions`);
  },
};
