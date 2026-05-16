import { apiDelete, apiGet, apiPost } from "./client";

export type AssetRole = string;
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
  attach: (trackId: number, role: AssetRole, path: string, options: { replace?: boolean } = {}) => {
    const qs = options.replace ? "?replace=true" : "";
    return apiPost<Asset>(`/api/tracks/${trackId}/assets${qs}`, { role, path });
  },
  detach: (trackId: number, assetId: number) =>
    apiDelete(`/api/tracks/${trackId}/assets/${assetId}`),
  relocate: (trackId: number, assetId: number, newPath: string) =>
    apiPost<Asset>(`/api/tracks/${trackId}/assets/${assetId}/relocate`, { new_path: newPath }),
  listForTrack: (trackId: number) => apiGet<Asset[]>(`/api/tracks/${trackId}/assets`),
  sweep: () =>
    apiPost<{ checked: number; marked_missing: number; recovered: number }>(
      `/api/sweep/assets`
    ),
};
