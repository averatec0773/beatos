import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export interface Track {
  id: number;
  title: string;
  bpm: number | null;
  key_signature: string | null;
  genre: string[] | null;
  mood: string[] | null;
  tags: string[] | null;
  description: string | null;
  description_draft: string | null;
  license_type: string;
  price: number | null;
  producer: string[] | null;
  has_audio: boolean;
  cover_asset_id: number | null;
  created_at: string;
  updated_at: string;
}

export type TrackUpdate = Partial<
  Omit<Track, "id" | "description_draft" | "has_audio" | "created_at" | "updated_at">
>;

export interface ListParams {
  source_id?: number;
  list_id?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  producers?: string[];
  genres?: string[];
  moods?: string[];
  keys?: string[];
  bpm_min?: number | null;
  bpm_max?: number | null;
  has_audio?: boolean | null;
}

export const tracks = {
  list: (params: ListParams = {}): Promise<Track[]> => {
    const sp = new URLSearchParams();
    if (params.list_id != null) sp.set("list_id", String(params.list_id));
    if (params.source_id != null) sp.set("source_id", String(params.source_id));
    if (params.sort_by) sp.set("sort_by", params.sort_by);
    if (params.sort_dir) sp.set("sort_dir", params.sort_dir);
    for (const p of params.producers ?? []) sp.append("producers", p);
    for (const g of params.genres ?? []) sp.append("genres", g);
    for (const m of params.moods ?? []) sp.append("moods", m);
    for (const k of params.keys ?? []) sp.append("keys", k);
    if (params.bpm_min != null) sp.set("bpm_min", String(params.bpm_min));
    if (params.bpm_max != null) sp.set("bpm_max", String(params.bpm_max));
    if (params.has_audio != null) sp.set("has_audio", String(params.has_audio));
    const qs = sp.toString();
    return apiGet<Track[]>(`/api/tracks${qs ? `?${qs}` : ""}`);
  },
  create: (title: string) => apiPost<Track>("/api/tracks", { title }),
  get: (id: number) => apiGet<Track>(`/api/tracks/${id}`),
  update: (id: number, updates: TrackUpdate) => apiPut<Track>(`/api/tracks/${id}`, updates),
  remove: (id: number) => apiDelete(`/api/tracks/${id}`),
};
