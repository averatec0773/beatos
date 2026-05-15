import { create } from "zustand";

import { AddFolderResult, WatchFolder, watcher as api } from "@/api/watcher";

interface WatcherState {
  folders: WatchFolder[];
  pendingScan: AddFolderResult | null;
  refresh(): Promise<void>;
  addFolder(path: string): Promise<AddFolderResult>;
  resolveScan(action: "import_all" | "skip" | "pick", paths?: string[]): Promise<number>;
  remove(folderId: number): Promise<void>;
}

export const useWatcherStore = create<WatcherState>((set, get) => ({
  folders: [],
  pendingScan: null,
  async refresh() {
    set({ folders: await api.list() });
  },
  async addFolder(path) {
    const res = await api.add(path);
    set({ pendingScan: res });
    // Re-fetch the canonical folder list (correct library_id, auto_import flag).
    await get().refresh();
    return res;
  },
  async resolveScan(action, paths) {
    const pending = get().pendingScan;
    if (!pending) return 0;
    const result = await api.scanExisting(pending.folder_id, action, paths);
    set({ pendingScan: null });
    return result.imported;
  },
  async remove(folderId) {
    await api.remove(folderId);
    set({ folders: get().folders.filter((f) => f.id !== folderId) });
  },
}));
