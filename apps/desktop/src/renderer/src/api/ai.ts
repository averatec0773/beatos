import { apiGet, apiPost } from "./client";

/**
 * In-app AI tagging status (EPIC-D4). Never carries the API key — only the
 * selected provider, whether a key is set, and whether tagging is usable.
 */
export interface AiStatus {
  provider: string | null;
  has_key: boolean;
  enabled: boolean;
  model: string;
  supported: string[];
  supported_models: string[];
}

/** Suggested metadata from the provider; the user reviews before applying. */
export interface TagSuggestion {
  genre: string[];
  mood: string[];
  tags: string[];
  description: string | null;
}

/** Background batch-tagging job (applies suggestions to empty fields only). */
export interface BatchTagJob {
  job_id: string;
  total: number;
  done: number;
  current_title: string | null;
  applied: number;
  errors: number;
  error_details?: string[];
  status: "running" | "done";
}

export const ai = {
  status: () => apiGet<AiStatus>("/api/ai/status"),
  suggestTags: (trackId: number) => apiPost<TagSuggestion>(`/api/tracks/${trackId}/suggest-tags`),
  startBatchTagging: (ids: number[]) =>
    apiPost<{ job_id: string; total: number }>("/api/ai/suggest-tags/batch", { ids }),
  batchTaggingStatus: (jobId: string) =>
    apiGet<BatchTagJob>(`/api/ai/suggest-tags/batch/${jobId}`),
};
