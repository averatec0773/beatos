import { apiPost } from "./client";

export const injectApi = {
  stage(trackId: number, platform: string): Promise<{ ok: boolean }> {
    return apiPost<{ ok: boolean }>(`/api/inject/stage`, {
      track_id: trackId,
      platform,
    });
  },
};
