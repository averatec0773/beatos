import { create } from "zustand";
import { assets as assetsApi } from "@/api/assets";
import { resolveAudioAsset } from "@/lib/audio-resolve";
import type { AudioRole } from "@/lib/audio-resolve";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type RepeatMode = "off" | "one" | "all";
export type QueueSourceKind = "all" | "source" | "list" | "search";

export interface QueueSource {
  kind: QueueSourceKind;
  id?: number | string;
}

interface PlayerState {
  currentTrackId: number | null;
  currentAssetId: number | null;
  currentRole: AudioRole | null;
  preferredRole: AudioRole | null;
  status: PlayerStatus;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queueTrackIds: number[];
  queueIndex: number;
  queueShuffleOrder: number[] | null;
  queueSource: QueueSource | null;
  /** Monotonic counter incremented on every loadAndPlay() call. The
   *  BottomPlayerBar's audio.src useEffect depends on this so retrying the
   *  same assetId still forces a fresh `<audio>` reset — fixes the case where
   *  a failed load leaves the element stuck and clicking play on the same
   *  track does nothing. */
  loadEpoch: number;

  togglePlay(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  _setPosition(p: number): void;
  _setDuration(d: number): void;
  _setStatus(s: PlayerStatus): void;

  playFromQueue(opts: {
    trackIds: number[];
    startIndex: number;
    source: QueueSource;
  }): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setPreferredRole(role: AudioRole): Promise<void>;
  _onEnded(): Promise<void>;
}

const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

function fisherYates(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function effectiveOrder(state: PlayerState): { order: number[]; cur: number } {
  if (state.shuffle && state.queueShuffleOrder) {
    const order = state.queueShuffleOrder;
    const cur = order.indexOf(state.queueIndex);
    return { order, cur: cur < 0 ? 0 : cur };
  }
  const n = state.queueTrackIds.length;
  return { order: Array.from({ length: n }, (_, i) => i), cur: state.queueIndex };
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  /**
   * Load a track's audio asset into the player.
   *
   * `targetStatus` decides what state to land in once the new asset is loaded:
   * - "playing" (default) — used by explicit play intent (row play button,
   *   playFromQueue) and natural queue advance after a track ends.
   * - "preserve" — keep whatever status was active before. Used for role
   *   switching (WAV ↔ MP3) and manual next/prev so a paused user doesn't
   *   get auto-played at, and a playing user keeps playing.
   */
  async function loadAndPlay(
    trackId: number,
    preferred: AudioRole | null,
    targetStatus: "playing" | "preserve" = "playing",
  ) {
    const list = await assetsApi.listForTrack(trackId);
    const asset = resolveAudioAsset(list, preferred);
    if (!asset) {
      set((s) => ({
        currentTrackId: trackId,
        currentAssetId: null,
        currentRole: null,
        status: "error",
        position: 0,
        duration: 0,
        loadEpoch: s.loadEpoch + 1,
      }));
      return;
    }
    const prevStatus = get().status;
    const nextStatus =
      targetStatus === "playing"
        ? "playing"
        : prevStatus === "playing"
          ? "playing"
          : "paused";
    set((s) => ({
      currentTrackId: trackId,
      currentAssetId: asset.id,
      currentRole: asset.role as AudioRole,
      status: nextStatus,
      position: 0,
      duration: 0,
      loadEpoch: s.loadEpoch + 1,
    }));
  }

  return {
    currentTrackId: null,
    currentAssetId: null,
    currentRole: null,
    preferredRole: null,
    status: "idle",
    position: 0,
    duration: 0,
    volume: 1,
    muted: false,
    shuffle: false,
    repeat: "off",
    queueTrackIds: [],
    queueIndex: 0,
    queueShuffleOrder: null,
    queueSource: null,
    loadEpoch: 0,

    togglePlay() {
      const s = get();
      if (s.status === "playing") {
        // Stuck-playing recovery: status says "playing" but no metadata loaded.
        // Click should retry the load instead of pausing into a dead state.
        if (s.duration === 0 && s.currentTrackId != null) {
          loadAndPlay(s.currentTrackId, s.preferredRole).catch((e) => {
            console.warn("[player] stuck-playing retry failed", e);
          });
          return;
        }
        set({ status: "paused" });
      } else if (s.status === "paused") {
        set({ status: "playing" });
      } else if ((s.status === "error" || s.status === "idle") && s.currentTrackId != null) {
        // Recover from a stuck state — re-attempt load. Without this, clicking
        // the row play button on a track in error/idle status would no-op.
        loadAndPlay(s.currentTrackId, s.preferredRole).catch((e) => {
          console.warn("[player] retry from error/idle failed", e);
        });
      }
    },

    seek(seconds) {
      set({ position: Math.max(0, seconds) });
    },

    setVolume(v) {
      set({ volume: Math.min(1, Math.max(0, v)), muted: false });
    },

    toggleMute() {
      set({ muted: !get().muted });
    },

    toggleShuffle() {
      const s = get();
      if (s.shuffle) {
        set({ shuffle: false, queueShuffleOrder: null });
        return;
      }
      const n = s.queueTrackIds.length;
      if (n === 0) {
        set({ shuffle: true, queueShuffleOrder: [] });
        return;
      }
      const order = fisherYates(n);
      const cur = s.queueIndex;
      const pos = order.indexOf(cur);
      if (pos > 0) [order[0], order[pos]] = [order[pos], order[0]];
      set({ shuffle: true, queueShuffleOrder: order });
    },

    cycleRepeat() {
      const idx = REPEAT_ORDER.indexOf(get().repeat);
      set({ repeat: REPEAT_ORDER[(idx + 1) % REPEAT_ORDER.length] });
    },

    _setPosition(p) {
      set({ position: p });
    },

    _setDuration(d) {
      set({ duration: d });
    },

    _setStatus(s) {
      set({ status: s });
    },

    async playFromQueue({ trackIds, startIndex, source }) {
      set({
        queueTrackIds: trackIds,
        queueIndex: startIndex,
        queueSource: source,
        queueShuffleOrder: null,
        shuffle: false,
      });
      await loadAndPlay(trackIds[startIndex], get().preferredRole);
    },

    async next() {
      const s = get();
      if (s.queueTrackIds.length === 0) return;
      const { order, cur } = effectiveOrder(s);
      let nextPos = cur + 1;
      if (nextPos >= order.length) {
        if (s.repeat === "all") {
          nextPos = 0;
        } else {
          set({ status: "paused" });
          return;
        }
      }
      const queueIndex = order[nextPos];
      set({ queueIndex });
      await loadAndPlay(s.queueTrackIds[queueIndex], get().preferredRole, "preserve");
    },

    async prev() {
      const s = get();
      if (s.queueTrackIds.length === 0) return;
      if (s.position > 3) {
        set({ position: 0 });
        return;
      }
      const { order, cur } = effectiveOrder(s);
      let prevPos = cur - 1;
      if (prevPos < 0) {
        if (s.repeat === "all") {
          prevPos = order.length - 1;
        } else {
          set({ position: 0 });
          return;
        }
      }
      const queueIndex = order[prevPos];
      set({ queueIndex });
      await loadAndPlay(s.queueTrackIds[queueIndex], get().preferredRole, "preserve");
    },

    async setPreferredRole(role) {
      const s = get();
      set({ preferredRole: role });
      if (s.currentTrackId == null) return;
      await loadAndPlay(s.currentTrackId, role, "preserve");
    },

    async _onEnded() {
      const s = get();
      if (s.repeat === "one") {
        set({ position: 0, status: "playing" });
        return;
      }
      await get().next();
    },
  };
});
