import { create } from "zustand";
import { assets as assetsApi } from "@/api/assets";
import { resolveAudioAsset, variantKey } from "@/lib/audio-resolve";
import type { VariantKey } from "@/lib/audio-resolve";
import { audioEngine } from "@/lib/audio-engine";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type RepeatMode = "off" | "one" | "all";
export type QueueOriginKind = "all" | "list";

export interface QueueOrigin {
  kind: QueueOriginKind;
  id?: number | string;
}

interface PlayerState {
  currentTrackId: number | null;
  currentAssetId: number | null;
  currentRole: VariantKey | null;
  preferredRole: VariantKey | null;
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
  queueOrigin: QueueOrigin | null;

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
    origin: QueueOrigin;
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
  next(opts?: { wrap?: boolean; autoplay?: boolean }): Promise<void>;
  prev(opts?: { wrap?: boolean }): Promise<void>;
  setPreferredRole(role: VariantKey): Promise<void>;
  _onEnded(): Promise<void>;
  /**
   * Restore the persisted resume point on boot: re-load the last track PAUSED
   * at its saved position. Falls back to idle (and clears the stale pointer) if
   * the track or its audio file no longer exists. Volume/mute/shuffle/repeat are
   * already restored into the initial state.
   */
  hydrate(): Promise<void>;
  /** Snapshot current prefs + resume point to localStorage (also on quit). */
  persistNow(): void;
}

const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

// Persistence (localStorage). These are genuine preferences / a resume point,
// so unlike the session-scoped queue + multi-select they survive a restart.
// See conventions/design-direction.md §10.
const STORAGE_KEY = "beatos.player.v1";

interface PersistedPlayer {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  preferredRole: VariantKey | null;
  lastTrackId: number | null;
  lastPosition: number;
}

const PLAYER_DEFAULTS: PersistedPlayer = {
  volume: 1,
  muted: false,
  shuffle: false,
  repeat: "off",
  preferredRole: null,
  lastTrackId: null,
  lastPosition: 0,
};

function loadPersistedPlayer(): PersistedPlayer {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...PLAYER_DEFAULTS };
    const p = JSON.parse(raw) as Partial<PersistedPlayer>;
    return {
      volume:
        typeof p.volume === "number" && Number.isFinite(p.volume)
          ? Math.min(1, Math.max(0, p.volume))
          : PLAYER_DEFAULTS.volume,
      muted: typeof p.muted === "boolean" ? p.muted : PLAYER_DEFAULTS.muted,
      shuffle: typeof p.shuffle === "boolean" ? p.shuffle : PLAYER_DEFAULTS.shuffle,
      repeat: REPEAT_ORDER.includes(p.repeat as RepeatMode)
        ? (p.repeat as RepeatMode)
        : PLAYER_DEFAULTS.repeat,
      preferredRole: (p.preferredRole as VariantKey | null) ?? null,
      lastTrackId:
        typeof p.lastTrackId === "number" && Number.isFinite(p.lastTrackId) ? p.lastTrackId : null,
      lastPosition:
        typeof p.lastPosition === "number" && Number.isFinite(p.lastPosition) && p.lastPosition > 0
          ? p.lastPosition
          : 0,
    };
  } catch {
    return { ...PLAYER_DEFAULTS };
  }
}

function writePersistedPlayer(p: PersistedPlayer): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage unavailable (tests / SSR) — fine */
  }
}

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
  // Monotonic token for the latest-wins guard in loadAndPlay (rapid switches).
  let loadToken = 0;

  const restored = loadPersistedPlayer();

  function persist(): void {
    const s = get();
    writePersistedPlayer({
      volume: s.volume,
      muted: s.muted,
      shuffle: s.shuffle,
      repeat: s.repeat,
      preferredRole: s.preferredRole,
      lastTrackId: s.currentTrackId,
      // getCurrentPosition is exact whether playing (computed) or paused.
      lastPosition: s.currentTrackId != null ? audioEngine.getCurrentPosition() : 0,
    });
  }

  /**
   * Resolve a track's audio asset, hand it to the engine, and optionally
   * start playback. `targetStatus`:
   *   - "playing": always start playback after load
   *   - "preserve": only start if we were already playing (used by role-switch,
   *     next/prev so a paused user stays paused, a playing user keeps going)
   */
  async function loadAndPlay(
    trackId: number,
    preferred: VariantKey | null,
    targetStatus: "playing" | "preserve" = "playing",
  ): Promise<void> {
    // Latest-wins guard: rapid track switches fire overlapping loadAndPlay
    // calls. A slow earlier asset-fetch/load must not clobber a newer one, so
    // each call claims a token and bails after every await if superseded.
    const myToken = ++loadToken;
    const prev = get();
    const list = await assetsApi.listForTrack(trackId);
    if (myToken !== loadToken) return;
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

    const shouldPlay = targetStatus === "playing" || prev.status === "playing";

    set({
      currentTrackId: trackId,
      currentAssetId: asset.id,
      currentRole: variantKey(asset.role, asset.format),
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
    if (myToken !== loadToken) return;
    // Record the new track as the resume point.
    persist();
    if (shouldPlay) {
      await audioEngine.play();
    }
  }

  return {
    currentTrackId: null,
    currentAssetId: null,
    currentRole: null,
    preferredRole: restored.preferredRole,
    status: "idle",
    position: 0,
    duration: 0,
    volume: restored.volume,
    muted: restored.muted,
    shuffle: restored.shuffle,
    repeat: restored.repeat,
    queueTrackIds: [],
    queueIndex: 0,
    queueShuffleOrder: null,
    queueOrigin: null,

    togglePlay() {
      const s = get();
      if (s.status === "playing") {
        audioEngine.pause();
      } else if (s.status === "paused") {
        audioEngine.play().catch((e) => {
          console.warn("[player] resume failed", e);
        });
      } else if ((s.status === "error" || s.status === "idle") && s.currentTrackId != null) {
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
      persist();
    },

    toggleMute() {
      const muted = !get().muted;
      set({ muted });
      audioEngine.setMuted(muted);
      persist();
    },

    toggleShuffle() {
      const s = get();
      if (s.shuffle) {
        set({ shuffle: false, queueShuffleOrder: null });
        persist();
        return;
      }
      const n = s.queueTrackIds.length;
      if (n === 0) {
        set({ shuffle: true, queueShuffleOrder: [] });
        persist();
        return;
      }
      const order = fisherYates(n);
      const cur = s.queueIndex;
      const pos = order.indexOf(cur);
      if (pos > 0) [order[0], order[pos]] = [order[pos], order[0]];
      set({ shuffle: true, queueShuffleOrder: order });
      persist();
    },

    cycleRepeat() {
      const idx = REPEAT_ORDER.indexOf(get().repeat);
      set({ repeat: REPEAT_ORDER[(idx + 1) % REPEAT_ORDER.length] });
      persist();
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

    async playFromQueue({ trackIds, startIndex, origin }) {
      set({
        queueTrackIds: trackIds,
        queueIndex: startIndex,
        queueOrigin: origin,
        queueShuffleOrder: null,
        shuffle: false,
      });
      await loadAndPlay(trackIds[startIndex], get().preferredRole);
    },

    async next(opts) {
      const s = get();
      if (s.queueTrackIds.length === 0) return;
      const { order, cur } = effectiveOrder(s);
      let nextPos = cur + 1;
      if (nextPos >= order.length) {
        // Manual Next (opts.wrap) always cycles to the first track. Auto-advance
        // on track-end only wraps under repeat="all"; repeat="off" stops here.
        if (s.repeat === "all" || opts?.wrap) {
          nextPos = 0;
        } else {
          audioEngine.pause();
          return;
        }
      }
      const queueIndex = order[nextPos];
      set({ queueIndex });
      // Auto-advance on track-end forces playback (the track only ends while
      // playing, but the engine has already flipped to "paused" by now, so
      // "preserve" would wrongly stop). Manual Next keeps "preserve".
      await loadAndPlay(
        s.queueTrackIds[queueIndex],
        get().preferredRole,
        opts?.autoplay ? "playing" : "preserve",
      );
    },

    async prev(opts) {
      const s = get();
      if (s.queueTrackIds.length === 0) return;
      if (s.position > 3) {
        audioEngine.seek(0);
        return;
      }
      const { order, cur } = effectiveOrder(s);
      let prevPos = cur - 1;
      if (prevPos < 0) {
        // Manual Prev (opts.wrap) always cycles to the last track; otherwise
        // only repeat="all" wraps, and repeat="off" just restarts the track.
        if (s.repeat === "all" || opts?.wrap) {
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
      persist();
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
      await get().next({ autoplay: true });
    },

    persistNow() {
      persist();
    },

    async hydrate() {
      // Prefs (volume/mute/shuffle/repeat) are already in the initial state;
      // make sure the engine matches before any playback.
      audioEngine.setVolume(get().volume);
      audioEngine.setMuted(get().muted);

      const { lastTrackId, lastPosition } = restored;
      if (lastTrackId == null) return;

      const myToken = ++loadToken;
      try {
        const list = await assetsApi.listForTrack(lastTrackId);
        if (myToken !== loadToken) return; // user already started something else
        const asset = resolveAudioAsset(list, get().preferredRole);
        if (!asset) {
          // Track gone (deleted/purged) or has no audio anymore → fallback to idle.
          writePersistedPlayer({ ...restored, lastTrackId: null, lastPosition: 0 });
          return;
        }
        set({
          currentTrackId: lastTrackId,
          currentAssetId: asset.id,
          currentRole: variantKey(asset.role, asset.format),
          status: "loading",
          position: 0,
          duration: 0,
        });
        await audioEngine.load(asset.id); // throws if the file is missing on disk
        if (myToken !== loadToken) return;
        // Restore PAUSED at the saved position — no autoplay on launch.
        if (lastPosition > 0) audioEngine.seek(lastPosition);
        set({ position: lastPosition > 0 ? lastPosition : 0 });
      } catch {
        // File missing / decode failure → clear the stale pointer, stay idle.
        writePersistedPlayer({ ...restored, lastTrackId: null, lastPosition: 0 });
        set({
          currentTrackId: null,
          currentAssetId: null,
          currentRole: null,
          status: "idle",
          position: 0,
          duration: 0,
        });
      }
    },
  };
});

// Snapshot the resume point on quit (position is only kept fresh in-memory).
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    usePlayerStore.getState().persistNow();
  });
}

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
