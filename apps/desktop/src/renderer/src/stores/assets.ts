import { create } from "zustand";

import { Asset, AssetRole, assets as api } from "@/api/assets";

interface AssetState {
  /** Assets keyed by track_id (only the currently-loaded editor track is cached). */
  byTrack: Record<number, Asset[]>;
  setForTrack(trackId: number, list: Asset[]): void;
  attach(trackId: number, role: AssetRole, path: string, options?: { replace?: boolean }): Promise<Asset>;
  detach(trackId: number, assetId: number): Promise<void>;
  relocate(trackId: number, assetId: number, newPath: string): Promise<Asset>;
}

export const useAssetStore = create<AssetState>((set) => ({
  byTrack: {},
  setForTrack(trackId, list) {
    set((s) => ({ byTrack: { ...s.byTrack, [trackId]: list } }));
  },
  async attach(trackId, role, path, options) {
    const a = await api.attach(trackId, role, path, options);
    set((s) => {
      const existing = s.byTrack[trackId] ?? [];
      const filtered = options?.replace ? existing.filter((x) => x.role !== role) : existing;
      return { byTrack: { ...s.byTrack, [trackId]: [...filtered, a] } };
    });
    return a;
  },
  async detach(trackId, assetId) {
    await api.detach(trackId, assetId);
    set((s) => ({
      byTrack: {
        ...s.byTrack,
        [trackId]: (s.byTrack[trackId] ?? []).filter((x) => x.id !== assetId),
      },
    }));
  },
  async relocate(trackId, assetId, newPath) {
    const a = await api.relocate(trackId, assetId, newPath);
    set((s) => ({
      byTrack: {
        ...s.byTrack,
        [trackId]: (s.byTrack[trackId] ?? []).map((x) => (x.id === assetId ? a : x)),
      },
    }));
    return a;
  },
}));
