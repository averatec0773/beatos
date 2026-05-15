import { apiDelete, apiGet, apiPost } from "./client";

export interface WatchFolder {
  id: number;
  library_id: number;
  path: string;
  auto_import: boolean;
}

export interface ScannedFile {
  path: string;
  sha256: string;
  size_bytes: number;
  duration_seconds?: number;
  sample_rate?: number;
  bpm?: number;
}

export interface AddFolderResult {
  folder_id: number;
  path: string;
  found_files: ScannedFile[];
}

export const watcher = {
  list: () => apiGet<WatchFolder[]>("/api/watch-folders"),
  add: (path: string) => apiPost<AddFolderResult>("/api/watch-folders", { path }),
  scanExisting: (
    folderId: number,
    action: "import_all" | "skip" | "pick",
    trackPaths?: string[]
  ) =>
    apiPost<{ imported: number }>(`/api/watch-folders/${folderId}/scan-existing`, {
      action,
      track_paths: trackPaths,
    }),
  remove: (folderId: number) => apiDelete(`/api/watch-folders/${folderId}`),
};
