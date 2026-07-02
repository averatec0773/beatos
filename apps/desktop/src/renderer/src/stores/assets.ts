import { create } from "zustand";

import { Asset, AssetRole, assets as api } from "@/api/assets";

interface AssetState {
  /** Assets keyed by track_id (only the currently-loaded editor track is cached). */
  byTrack: Record<number, Asset[]>;
  /**
   * Fetch a track's assets, deduping concurrent callers. `tracks.select` and the
   * editor mount effect both want the list on open — a double-click plus a
   * StrictMode double-invoke can fire this 2–4× for the same id. In-flight
   * requests for a given id share one promise (held in `inflightAssets`); once
   * settled the entry clears so the next call refetches fresh (no staleness).
   */
  ensureForTrack(trackId: number): Promise<Asset[]>;
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

/**
 * Module-level registry of in-flight `listForTrack` requests, keyed by track id.
 * Kept outside the store so it never triggers a render and survives store resets.
 */
const inflightAssets = new Map<number, Promise<Asset[]>>();

export const useAssetStore = create<AssetState>((set, get) => ({
  byTrack: {},
  version: 0,
  ensureForTrack(trackId) {
    const pending = inflightAssets.get(trackId);
    if (pending) return pending;
    const p = api
      .listForTrack(trackId)
      .then((list) => {
        get().setForTrack(trackId, list);
        return list;
      })
      .finally(() => {
        inflightAssets.delete(trackId);
      });
    inflightAssets.set(trackId, p);
    return p;
  },
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
