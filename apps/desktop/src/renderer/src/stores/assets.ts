import { create } from "zustand";

import { Asset, AssetRole, assets as api } from "@/api/assets";

interface AssetState {
  /** Assets keyed by track_id (only the currently-loaded editor track is cached). */
  byTrack: Record<number, Asset[]>;
  /**
   * Monotonic counter bumped whenever a track's assets change. Components that
   * fetch assets independently of `byTrack` — the player's RoleSwitcher does its
   * own `listForTrack` keyed on the playing track id — subscribe to this and add
   * it to their effect deps so an out-of-band change (an MCP `attach_assets`
   * approval, or a manual attach to the already-playing track) re-fetches instead
   * of going stale until a restart.
   */
  version: number;
  bump(): void;
  setForTrack(trackId: number, list: Asset[]): void;
  attach(
    trackId: number,
    role: AssetRole,
    path: string,
    options?: { replace?: boolean },
  ): Promise<Asset>;
  detach(trackId: number, assetId: number): Promise<void>;
  relocate(trackId: number, assetId: number, newPath: string): Promise<Asset>;
}

export const useAssetStore = create<AssetState>((set) => ({
  byTrack: {},
  version: 0,
  bump() {
    set((s) => ({ version: s.version + 1 }));
  },
  setForTrack(trackId, list) {
    set((s) => ({ byTrack: { ...s.byTrack, [trackId]: list } }));
  },
  async attach(trackId, role, path, options) {
    const a = await api.attach(trackId, role, path, options);
    set((s) => {
      const existing = s.byTrack[trackId] ?? [];
      // Identity is (role, format) now — drop only the matching slot so other
      // formats of the same role survive a replace.
      const filtered = existing.filter((x) => !(x.role === a.role && x.format === a.format));
      return {
        byTrack: { ...s.byTrack, [trackId]: [...filtered, a] },
        version: s.version + 1,
      };
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
      version: s.version + 1,
    }));
  },
  async relocate(trackId, assetId, newPath) {
    const a = await api.relocate(trackId, assetId, newPath);
    set((s) => ({
      byTrack: {
        ...s.byTrack,
        [trackId]: (s.byTrack[trackId] ?? []).map((x) => (x.id === assetId ? a : x)),
      },
      version: s.version + 1,
    }));
    return a;
  },
}));
