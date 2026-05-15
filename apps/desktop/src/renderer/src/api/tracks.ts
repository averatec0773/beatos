import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export interface Track {
  id: number;
  title: string;
  bpm: number | null;
  key_signature: string | null;
  genre: string | null;
  mood: string | null;
  tags: string[] | null;
  description: string | null;
  description_draft: string | null;
  license_type: string;
  price: number | null;
  created_at: string;
  updated_at: string;
}

export type TrackUpdate = Partial<
  Omit<Track, "id" | "description_draft" | "created_at" | "updated_at">
>;

export const tracks = {
  list: (opts: { source_id?: number } = {}) => {
    const qs = opts.source_id != null ? `?source_id=${opts.source_id}` : "";
    return apiGet<Track[]>(`/api/tracks${qs}`);
  },
  create: (title: string) => apiPost<Track>("/api/tracks", { title }),
  get: (id: number) => apiGet<Track>(`/api/tracks/${id}`),
  update: (id: number, updates: TrackUpdate) => apiPut<Track>(`/api/tracks/${id}`, updates),
  remove: (id: number) => apiDelete(`/api/tracks/${id}`),
};
