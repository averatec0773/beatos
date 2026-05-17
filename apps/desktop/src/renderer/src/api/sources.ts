import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export interface Source {
  id: number;
  name: string;
  root_path: string;
  position: number;
  created_at: string;
  status: "online" | "offline";
  track_count: number;
}

export interface SourceCreate {
  name?: string;
  root_path: string;
}

export interface SourceUpdate {
  name?: string;
  root_path?: string;
  position?: number;
}

export const sources = {
  list: () => apiGet<Source[]>("/api/sources"),
  create: (payload: SourceCreate) => apiPost<Source>("/api/sources", payload),
  update: (id: number, payload: SourceUpdate) =>
    apiPatch<Source>(`/api/sources/${id}`, payload),
  remove: (id: number) => apiDelete(`/api/sources/${id}`),
  status: (id: number) =>
    apiGet<{ source_id: number; status: "online" | "offline"; last_checked_at: string }>(
      `/api/sources/${id}/status`
    ),
  reorder: async (ids: number[]): Promise<void> => {
    await apiPost("/api/sources/reorder", { ids });
  },
};
