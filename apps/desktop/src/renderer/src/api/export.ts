import { apiGet } from "./client";

export interface ExportField {
  key: string;
  label: string;
  value: string;
  options: string[];
  note: string | null;
}

export interface ExportResult {
  platform: string;
  fields: ExportField[];
}

export const exportApi = {
  platforms(): Promise<{ platforms: string[] }> {
    return apiGet<{ platforms: string[] }>(`/api/export/platforms`);
  },
  forTrack(trackId: number, platform: string): Promise<ExportResult> {
    return apiGet<ExportResult>(
      `/api/tracks/${trackId}/export?platform=${encodeURIComponent(platform)}`,
    );
  },
};
