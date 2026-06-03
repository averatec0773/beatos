import { apiGet } from "./client";

export const proApi = {
  status(): Promise<{ publish: boolean }> {
    return apiGet<{ publish: boolean }>(`/api/pro/status`);
  },
};
