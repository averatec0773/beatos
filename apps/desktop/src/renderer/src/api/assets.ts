import { apiDelete, apiGet, apiPost } from "./client";

export type AssetRole = "audio" | "stems" | "cover";
export type AssetMode = "linked" | "managed";

export interface Asset {
  id: number;
  track_id: number;
  role: AssetRole;
  mode: AssetMode;
  abs_path: string;
  rel_path: string | null;
  sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  missing: boolean;
  created_at: string;
}

export const assets = {
  attach: (trackId: number, role: AssetRole, path: string) =>
    apiPost<Asset>(`/api/tracks/${trackId}/assets`, { role, path }),
  detach: (trackId: number, assetId: number) =>
    apiDelete(`/api/tracks/${trackId}/assets/${assetId}`),
  relocate: (trackId: number, assetId: number, newPath: string) =>
    apiPost<Asset>(`/api/tracks/${trackId}/assets/${assetId}/relocate`, { new_path: newPath }),
  moveToManaged: (trackId: number, assetId: number) =>
    apiPost<void>(`/api/tracks/${trackId}/assets/${assetId}/move`),
  listForTrack: (trackId: number) => apiGet<Asset[]>(`/api/tracks/${trackId}/assets`),
  sweep: () =>
    apiPost<{ checked: number; marked_missing: number; recovered: number }>(
      `/api/sweep/assets`
    ),
};
