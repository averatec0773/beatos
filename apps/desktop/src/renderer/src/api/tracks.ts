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
  producer: string | null;
  has_audio: boolean;
  cover_asset_id: number | null;
  created_at: string;
  updated_at: string;
}

export type TrackUpdate = Partial<
  Omit<Track, "id" | "description_draft" | "has_audio" | "created_at" | "updated_at">
>;

export const tracks = {
  list: (opts: { source_id?: number; list_id?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.list_id != null) params.set("list_id", String(opts.list_id));
    else if (opts.source_id != null) params.set("source_id", String(opts.source_id));
    const qs = params.toString();
    return apiGet<Track[]>(`/api/tracks${qs ? `?${qs}` : ""}`);
  },
  create: (title: string) => apiPost<Track>("/api/tracks", { title }),
  get: (id: number) => apiGet<Track>(`/api/tracks/${id}`),
  update: (id: number, updates: TrackUpdate) => apiPut<Track>(`/api/tracks/${id}`, updates),
  remove: (id: number) => apiDelete(`/api/tracks/${id}`),
};
