import { apiGet, apiPost } from "./client";

export interface AudioAnalysisResult {
  asset_id: number;
  sha256: string;
  bpm: number | null;
  bpm_confidence: number | null;
  key: string | null;
  key_confidence: number | null;
  duration_seconds: number | null;
  analyzed_at: string;
}

export interface BatchJob {
  job_id: string;
  total: number;
  done: number;
  current_title: string | null;
  filled_bpm: number;
  filled_key: number;
  errors: number;
  status: "running" | "done";
}

export const analysis = {
  analyze(trackId: number): Promise<AudioAnalysisResult> {
    return apiPost<AudioAnalysisResult>(`/api/tracks/${trackId}/analyze`, {});
  },
  startBatch(scope: "selected" | "unanalyzed", ids?: number[]): Promise<{ job_id: string; total: number }> {
    return apiPost(`/api/analysis/batch`, { scope, ids: ids ?? null });
  },
  batchStatus(jobId: string): Promise<BatchJob> {
    return apiGet<BatchJob>(`/api/analysis/batch/${jobId}`);
  },
  unanalyzedCount(): Promise<{ count: number }> {
    return apiGet<{ count: number }>(`/api/tracks/unanalyzed/count`);
  },
};
