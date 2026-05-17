import { apiPost } from "./client";

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

export const analysis = {
  analyze(trackId: number): Promise<AudioAnalysisResult> {
    return apiPost<AudioAnalysisResult>(`/api/tracks/${trackId}/analyze`, {});
  },
};
