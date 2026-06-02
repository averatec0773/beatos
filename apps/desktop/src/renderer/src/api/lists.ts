import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export type ListKind = "system" | "user" | "beattape";

export interface List {
  id: number;
  name: string;
  kind: ListKind;
  position: number;
  created_at: string;
}

export interface ExportFile {
  asset_id: number;
  role: string;
  filename: string;
  size_bytes: number | null;
  missing: boolean;
}

export interface ExportManifestItem {
  track_id: number;
  title: string;
  files: ExportFile[];
}

export type ExportMode = "zip" | "folder";

export interface ExportPackageResult {
  output_path: string;
  file_count: number;
  skipped: string[];
}

export const lists = {
  all: () => apiGet<List[]>("/api/lists"),
  create: (name: string, kind: ListKind = "user") => apiPost<List>("/api/lists", { name, kind }),
  rename: (id: number, name: string) => apiPut<List>(`/api/lists/${id}`, { name }),
  remove: (id: number) => apiDelete(`/api/lists/${id}`),
  addTrack: (listId: number, trackId: number) =>
    apiPost<{ added: boolean }>(`/api/lists/${listId}/tracks`, { track_id: trackId }),
  removeTrack: (listId: number, trackId: number) =>
    apiDelete(`/api/lists/${listId}/tracks/${trackId}`),
  reorder: async (ids: number[]): Promise<void> => {
    await apiPost("/api/lists/reorder", { ids });
  },
  exportManifest: (listId: number) =>
    apiGet<ExportManifestItem[]>(`/api/lists/${listId}/export/manifest`),
  exportPackage: (
    listId: number,
    body: { mode: ExportMode; dest: string; items: { track_id: number; asset_ids: number[] }[] },
  ) => apiPost<ExportPackageResult>(`/api/lists/${listId}/export/package`, body),
};
