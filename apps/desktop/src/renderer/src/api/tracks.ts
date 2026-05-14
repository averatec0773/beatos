import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export interface Track {
  id: number;
  library_id: number;
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
  platform_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type TrackUpdate = Partial<
  Omit<Track, "id" | "library_id" | "description_draft" | "created_at" | "updated_at">
>;

export const tracks = {
  list: () => apiGet<Track[]>("/api/tracks"),
  create: (title: string) => apiPost<Track>("/api/tracks", { title }),
  get: (id: number) => apiGet<Track>(`/api/tracks/${id}`),
  update: (id: number, updates: TrackUpdate) => apiPut<Track>(`/api/tracks/${id}`, updates),
  remove: (id: number) => apiDelete(`/api/tracks/${id}`),
};
