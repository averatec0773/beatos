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
  /** Streamable preview audio (music platforms). */
  audio_asset_id?: number;
  /** Promo video (video platforms, e.g. douyin). */
  video_asset_id?: number;
  cover_asset_id?: number;
  /** Buyer deliverable — the lossless untagged WAV uploaded into the license drawer. */
  deliverable_wav_asset_id?: number;
  /** Buyer deliverable — the stems package for the 分轨 tier. */
  deliverable_stems_asset_id?: number;
  account?: string;
  dry_run?: boolean;
}

export type SessionState = "valid" | "expired" | "not_logged_in" | "checking" | "unknown";

export type ValidatedSessionState = "valid" | "expired" | "not_logged_in" | "unknown";

export type LoginStatus = "pending" | "success" | "failed" | "timeout";

export interface PublishJobFull {
  job_id: string;
  stage: string;
  message: string;
  updated_at: string;
  request: { track_id: number; platform: string };
  result?: { ok: boolean; url?: string; error?: string };
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
  validateSessions(
    platforms?: string[],
  ): Promise<{ sessions: Record<string, ValidatedSessionState> }> {
    return apiPost<{ sessions: Record<string, ValidatedSessionState> }>(
      `/api/publish/sessions/validate`,
      platforms && platforms.length ? { platforms } : {},
    );
  },
  login(platform: string): Promise<{ login_id: string }> {
    return apiPost<{ login_id: string }>(`/api/publish/login`, { platform });
  },
  loginStatus(loginId: string): Promise<{ status: LoginStatus; message: string }> {
    return apiGet<{ status: LoginStatus; message: string }>(
      `/api/publish/login/${encodeURIComponent(loginId)}`,
    );
  },
  jobs(): Promise<{ jobs: PublishJobFull[] }> {
    return apiGet<{ jobs: PublishJobFull[] }>(`/api/publish/jobs`);
  },
};
