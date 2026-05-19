import { create } from "zustand";
import { assets as assetsApi } from "@/api/assets";
import { resolveAudioAsset } from "@/lib/audio-resolve";
import type { AudioRole } from "@/lib/audio-resolve";
import { audioEngine } from "@/lib/audio-engine";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type RepeatMode = "off" | "one" | "all";
export type QueueSourceKind = "all" | "list" | "search";

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

  togglePlay(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  /** Engine → store bridges. Called by BottomPlayerBar's subscription. */
  _setPosition(p: number): void;
  _setDuration(d: number): void;
  _setStatus(s: PlayerStatus): void;

  playFromQueue(opts: {
    trackIds: number[];
    startIndex: number;
    source: QueueSource;
  }): Promise<void>;
  /**
   * Replace the queue's contents and re-anchor `queueIndex` to wherever
   * `anchorTrackId` sits in the new id list. Preserves shuffle mode: if
   * shuffle is on, a fresh shuffle order is generated for the new ids with
   * the anchor swapped to position 0 (so prev/next still walk from the
   * current track). Used by the bottom-bar Prev/Next handlers to keep the
   * queue aligned with the current visible filter.
   */
  syncQueue(trackIds: number[], anchorTrackId: number | null): void;
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
   * Resolve a track's audio asset, hand it to the engine, and optionally
   * start playback. `targetStatus`:
   *   - "playing": always start playback after load
   *   - "preserve": only start if we were already playing (used by role-switch,
   *     next/prev so a paused user stays paused, a playing user keeps going)
   */
  async function loadAndPlay(
    trackId: number,
    preferred: AudioRole | null,
    targetStatus: "playing" | "preserve" = "playing",
  ): Promise<void> {
    const prev = get();
    const list = await assetsApi.listForTrack(trackId);
    const asset = resolveAudioAsset(list, preferred);

    if (!asset) {
      audioEngine.stop();
      set({
        currentTrackId: trackId,
        currentAssetId: null,
        currentRole: null,
        status: "error",
        position: 0,
        duration: 0,
      });
      return;
    }

    const shouldPlay =
      targetStatus === "playing" || prev.status === "playing";

    set({
      currentTrackId: trackId,
      currentAssetId: asset.id,
      currentRole: asset.role as AudioRole,
      status: "loading",
      position: 0,
      duration: 0,
    });

    try {
      await audioEngine.load(asset.id);
    } catch {
      // engine fires "error" event → _setStatus("error") via subscription
      return;
    }
    if (shouldPlay) {
      await audioEngine.play();
    }
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

    togglePlay() {
      const s = get();
      if (s.status === "playing") {
        audioEngine.pause();
      } else if (s.status === "paused") {
        audioEngine.play().catch((e) => {
          console.warn("[player] resume failed", e);
        });
      } else if (
        (s.status === "error" || s.status === "idle") &&
        s.currentTrackId != null
      ) {
        // Recovery: retry load + play from a broken state.
        loadAndPlay(s.currentTrackId, s.preferredRole).catch((e) => {
          console.warn("[player] retry from error/idle failed", e);
        });
      }
    },

    seek(seconds) {
      audioEngine.seek(seconds);
    },

    setVolume(v) {
      const clamped = Math.min(1, Math.max(0, v));
      set({ volume: clamped, muted: false });
      audioEngine.setVolume(clamped);
      audioEngine.setMuted(false);
    },

    toggleMute() {
      const muted = !get().muted;
      set({ muted });
      audioEngine.setMuted(muted);
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

    syncQueue(trackIds, anchorTrackId) {
      const s = get();
      const anchorIdx = anchorTrackId != null ? trackIds.indexOf(anchorTrackId) : -1;
      const queueIndex = anchorIdx >= 0 ? anchorIdx : 0;
      if (s.shuffle && trackIds.length > 0) {
        const order = fisherYates(trackIds.length);
        const pos = order.indexOf(queueIndex);
        if (pos > 0) [order[0], order[pos]] = [order[pos], order[0]];
        set({ queueTrackIds: trackIds, queueIndex, queueShuffleOrder: order });
      } else {
        set({ queueTrackIds: trackIds, queueIndex, queueShuffleOrder: null });
      }
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
          audioEngine.pause();
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
        audioEngine.seek(0);
        return;
      }
      const { order, cur } = effectiveOrder(s);
      let prevPos = cur - 1;
      if (prevPos < 0) {
        if (s.repeat === "all") {
          prevPos = order.length - 1;
        } else {
          audioEngine.seek(0);
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
        audioEngine.seek(0);
        await audioEngine.play();
        return;
      }
      await get().next();
    },
  };
});

// Wire the audio engine to the store. Owned at module level so:
//   1. Tests that mock audio-engine see a single, deterministic subscription
//      (no need to mount BottomPlayerBar).
//   2. The bottom player bar focuses on UI concerns only (volume init, toast
//      on decode error) — engine ↔ store sync is here.
audioEngine.on("statuschange", (s) => usePlayerStore.getState()._setStatus(s));
audioEngine.on("timeupdate", (p) => usePlayerStore.getState()._setPosition(p));
audioEngine.on("durationchange", (d) => usePlayerStore.getState()._setDuration(d));
audioEngine.on("ended", () => {
  void usePlayerStore.getState()._onEnded();
});
