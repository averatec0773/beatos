/**
 * Tone.js-backed audio engine for BeatOS.
 *
 * Why Tone instead of raw <audio> or raw Web Audio API:
 *   - `Tone.ToneAudioBuffer` wraps `decodeAudioData` which natively supports
 *     FLOAT-32 / 24-bit / WAVE_FORMAT_EXTENSIBLE — no manual byte-level
 *     transcode needed.
 *   - `Tone.Transport.bpm` gives us a first-class BPM control that future MCP
 *     tools (`playback.set_bpm`) can map to directly.
 *   - `Player.playbackRate` / `loopStart` / `loopEnd` / future effects chain
 *     are all one-liners — the foundation a beat-producer tool needs.
 *
 * State machine (`EngineStatus`):
 *
 *     idle ──load──▶ loading ──ok──▶ paused ──play──▶ playing
 *                       │              ▲                │
 *                       │              │                ├──pause──▶ paused
 *                       │              │                └──ended──▶ paused (offset reset to 0)
 *                       └──fail──▶ error
 *
 * Position model: we do NOT poll `Tone.Player.now()` — Player has no exposed
 * cursor. We track `offsetAtStart` (where the last `play()` started from) and
 * `contextTimeAtStart` (Tone.now() at that moment); current position is
 * `offsetAtStart + (Tone.now() - contextTimeAtStart)` while playing, else
 * `offsetAtStart`. Both `timeupdate` and natural-end (`ended`) are detected
 * inside the same RAF tick — checking `position >= cachedDuration`. Doing
 * this via RAF instead of `setTimeout` makes the engine suspend-resilient:
 * `Tone.now()` is the AudioContext clock, which freezes on system sleep,
 * so RAF detection won't fire a premature `ended` while the laptop is
 * suspended.
 */

import * as Tone from "tone";

import { computePeaks } from "@/lib/waveform";

export type EngineStatus = "idle" | "loading" | "paused" | "playing" | "error";

type Listener<T> = (arg: T) => void;
type EventMap = {
  timeupdate: number;
  durationchange: number;
  ended: void;
  error: Error;
  statuschange: EngineStatus;
};

// Byte-budgeted cache. A single 5-min stereo FLOAT-32 buffer is ~52 MB, and
// real DAW exports can hit 100+ MB each, so a count-based cap (e.g. 16) would
// hold gigabytes worst-case. 256 MB lets the user A/B between a handful of
// large beats without thrashing decode while staying well clear of the 32-bit
// renderer's ~1.4 GB heap ceiling.
const BUFFER_CACHE_BUDGET_BYTES = 256 * 1024 * 1024;

function bufferSizeBytes(buf: Tone.ToneAudioBuffer): number {
  // ToneAudioBuffer.get() returns the underlying AudioBuffer (or null in
  // edge cases like a freshly-disposed buffer). 4 bytes per float32 sample.
  const ab = buf.get();
  if (!ab) return 0;
  return ab.numberOfChannels * ab.length * 4;
}

class AudioEngine {
  private player: Tone.Player | null = null;
  private bufferCache = new Map<number, Tone.ToneAudioBuffer>();
  private currentAssetId: number | null = null;
  private cachedDuration = 0;
  private offsetAtStart = 0;
  private contextTimeAtStart = 0;
  private status: EngineStatus = "idle";
  private volume = 1;
  private muted = false;
  private forceMuted = false;
  private rafId: number | null = null;
  private bufferCacheBytes = 0;
  private listeners: { [K in keyof EventMap]?: Set<Listener<EventMap[K]>> } = {};
  // Shared waveform analyser tapped between player and destination, feeding the
  // live shimmer of the ASCII seek waveform. Created lazily (no AudioContext at
  // construction time). Static per-track peaks are cached separately.
  private analyser: Tone.Analyser | null = null;
  private peaksCache = new Map<number, number[]>();

  /** Load + decode an asset. Reuses cached buffers (byte-budgeted LRU). */
  async load(assetId: number): Promise<void> {
    if (this.currentAssetId === assetId && this.player) {
      // Same asset already loaded. The engine may have been left in `idle`
      // (e.g. a previous `stop()` after the user transitioned through a
      // no-audio track), in which case a plain early-return would leave the
      // store stuck at `loading` with progress 0-0. Re-arm the post-load
      // state machine so callers see a consistent `paused` + duration.
      this.stopRaf();
      this.offsetAtStart = 0;
      this.setStatus("paused");
      this.emit("durationchange", this.cachedDuration);
      this.emit("timeupdate", 0);
      return;
    }

    this.stopRaf();
    if (this.player) {
      this.player.stop();
      this.player.dispose();
      this.player = null;
    }
    this.setStatus("loading");

    let buf = this.bufferCache.get(assetId);
    if (buf) {
      // Cache hit — refresh recency by moving this key to the Map's tail.
      // Map iteration order is insertion order in V8; deleting + re-setting
      // makes this entry the most-recently-used so the next eviction pass
      // can't drop the buffer we're about to play.
      this.bufferCache.delete(assetId);
      this.bufferCache.set(assetId, buf);
    } else {
      try {
        buf = await new Tone.ToneAudioBuffer().load(`beatos-asset://audio/${assetId}`);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.currentAssetId = null;
        this.cachedDuration = 0;
        this.setStatus("error");
        this.emit("error", err);
        throw err;
      }
      this.cacheBuffer(assetId, buf);
    }

    this.currentAssetId = assetId;
    this.cachedDuration = buf.duration;
    this.offsetAtStart = 0;
    this.contextTimeAtStart = 0;

    // Route through the shared analyser (which itself reaches the destination)
    // so the live waveform can read post-volume amplitude.
    this.player = new Tone.Player(buf).connect(this.getAnalyser());
    this.applyAudioParams();

    this.emit("durationchange", this.cachedDuration);
    this.emit("timeupdate", 0);
    this.setStatus("paused");
  }

  /** Start (or resume from `offsetAtStart`). Lazily starts AudioContext. */
  async play(): Promise<void> {
    if (!this.player) return;
    if (Tone.getContext().state !== "running") {
      await Tone.start();
      // A concurrent load()/dispose() (rapid track switch) can null the player
      // while we were parked on the await — re-check before dereferencing.
      if (!this.player) return;
    }
    this.contextTimeAtStart = Tone.now();
    this.player.start(undefined, this.offsetAtStart);
    this.setStatus("playing");
    this.startRaf();
  }

  pause(): void {
    if (!this.player || this.status !== "playing") return;
    this.offsetAtStart = this.getCurrentPosition();
    this.player.stop();
    this.stopRaf();
    this.setStatus("paused");
    this.emit("timeupdate", this.offsetAtStart);
  }

  /** Hard reset: stop + rewind to 0 + status=idle. Used on track unload. */
  stop(): void {
    if (this.player) this.player.stop();
    this.stopRaf();
    this.offsetAtStart = 0;
    this.setStatus("idle");
    this.emit("timeupdate", 0);
  }

  seek(positionSec: number): void {
    if (!this.player) return;
    const clamped = Math.max(0, Math.min(positionSec, this.cachedDuration));
    const wasPlaying = this.status === "playing";
    this.offsetAtStart = clamped;
    if (wasPlaying) {
      this.player.stop();
      this.contextTimeAtStart = Tone.now();
      this.player.start(undefined, clamped);
    }
    this.emit("timeupdate", clamped);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyAudioParams();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyAudioParams();
  }

  /** Smoke / diagnose harnesses set this from env before load. */
  setForceMuted(force: boolean): void {
    this.forceMuted = force;
    this.applyAudioParams();
  }

  /** Future MCP hook: agents call this to align playback to a beat grid. */
  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  getBpm(): number {
    return Tone.getTransport().bpm.value;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getDuration(): number {
    return this.cachedDuration;
  }

  getCurrentPosition(): number {
    if (this.status === "playing") {
      const elapsed = Tone.now() - this.contextTimeAtStart;
      return Math.min(this.offsetAtStart + elapsed, this.cachedDuration);
    }
    return this.offsetAtStart;
  }

  getCurrentAssetId(): number | null {
    return this.currentAssetId;
  }

  /**
   * Normalized per-track peak silhouette (0–1) for the seek waveform, computed
   * once from the decoded buffer and cached per asset. Null when no track is
   * loaded or its buffer isn't resident.
   */
  getPeaks(n = 72): number[] | null {
    const id = this.currentAssetId;
    if (id == null) return null;
    const cached = this.peaksCache.get(id);
    if (cached && cached.length === n) return cached;
    const buf = this.bufferCache.get(id);
    if (!buf) return null;
    let channel: Float32Array;
    try {
      channel = buf.getChannelData(0);
    } catch {
      return null;
    }
    const peaks = computePeaks(channel, n);
    this.peaksCache.set(id, peaks);
    return peaks;
  }

  /** Current output amplitude (0–1, RMS) for the live shimmer; 0 when idle. */
  getLiveLevel(): number {
    if (!this.analyser || this.status !== "playing") return 0;
    const values = this.analyser.getValue();
    if (!(values instanceof Float32Array)) return 0;
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i] * values[i];
    return Math.min(1, Math.sqrt(sum / values.length) * 2.5);
  }

  /**
   * Live time-domain samples (−1..1) for the playing waveform, or null when
   * not playing / no analyser. The seek waveform downsamples this per frame so
   * the whole field reacts to the audio.
   */
  getWaveform(): Float32Array | null {
    if (!this.analyser || this.status !== "playing") return null;
    const values = this.analyser.getValue();
    return values instanceof Float32Array ? values : null;
  }

  on<K extends keyof EventMap>(event: K, cb: Listener<EventMap[K]>): () => void {
    let set = this.listeners[event] as Set<Listener<EventMap[K]>> | undefined;
    if (!set) {
      set = new Set();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.listeners[event] = set as any;
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  /**
   * Test / teardown only. Drops all buffers + cancels timers and resets
   * state, but DOES NOT clear listeners — module-level subscriptions in
   * player.ts are registered exactly once at import and must survive across
   * test resets. If you genuinely need a fresh listener set (e.g. unit
   * testing the engine in isolation), call `clearListeners()` explicitly.
   */
  dispose(): void {
    this.stopRaf();
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    for (const buf of this.bufferCache.values()) buf.dispose();
    this.bufferCache.clear();
    this.peaksCache.clear();
    this.bufferCacheBytes = 0;
    this.currentAssetId = null;
    this.cachedDuration = 0;
    this.offsetAtStart = 0;
    this.status = "idle";
  }

  /** Detach every event listener. Only useful for isolated engine unit tests. */
  clearListeners(): void {
    this.listeners = {};
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /** Lazily create the shared analyser (connected straight to destination). */
  private getAnalyser(): Tone.Analyser {
    if (!this.analyser) {
      // "waveform" → time-domain samples in [-1, 1]; 1024 is plenty for an RMS.
      this.analyser = new Tone.Analyser("waveform", 1024);
      this.analyser.toDestination();
    }
    return this.analyser;
  }

  private applyAudioParams(): void {
    if (!this.player) return;
    // `volume.value = -Infinity` is not reliably honoured by the underlying
    // gain, so zero (or muted) must also flip `mute` to guarantee silence —
    // otherwise the slider at minimum leaves playback at its last level.
    const silent = this.volume <= 0;
    this.player.volume.value = silent ? -60 : Tone.gainToDb(this.volume);
    this.player.mute = this.muted || this.forceMuted || silent;
  }

  private cacheBuffer(assetId: number, buf: Tone.ToneAudioBuffer): void {
    const bytes = bufferSizeBytes(buf);
    // If the asset is already cached (shouldn't happen — load() checked
    // first — but be defensive), subtract its old footprint so we don't
    // double-count.
    if (this.bufferCache.has(assetId)) {
      const old = this.bufferCache.get(assetId);
      if (old) this.bufferCacheBytes -= bufferSizeBytes(old);
      this.bufferCache.delete(assetId);
    }
    this.bufferCache.set(assetId, buf);
    this.bufferCacheBytes += bytes;

    // Evict LRU until under budget. Always keep at least the just-inserted
    // entry — a single buffer that exceeds the budget by itself is allowed
    // (the alternative is rejecting playback of large tracks, worse UX).
    while (this.bufferCacheBytes > BUFFER_CACHE_BUDGET_BYTES && this.bufferCache.size > 1) {
      const oldest = this.bufferCache.keys().next().value;
      if (oldest === undefined || oldest === assetId) break;
      const oldBuf = this.bufferCache.get(oldest);
      if (oldBuf) {
        this.bufferCacheBytes -= bufferSizeBytes(oldBuf);
        oldBuf.dispose();
      }
      this.bufferCache.delete(oldest);
    }
  }

  private startRaf(): void {
    if (this.rafId != null) return;
    if (typeof requestAnimationFrame !== "function") return; // jsdom guard
    const tick = (): void => {
      if (this.status !== "playing") {
        this.rafId = null;
        return;
      }
      // AudioContext suspend (system sleep, output device change). The audio
      // clock freezes when the context is non-running, so without this check
      // getCurrentPosition() would keep ticking on next resume — phantom
      // position advance. Treat it as a clean pause; user can resume.
      const ctxState = Tone.getContext().state;
      if (ctxState !== "running") {
        this.offsetAtStart = this.getCurrentPosition();
        this.rafId = null;
        this.setStatus("paused");
        this.emit("timeupdate", this.offsetAtStart);
        return;
      }
      // Natural end detection. RAF-driven (not setTimeout) so this is
      // suspend-resilient: ended fires only when AudioContext.currentTime
      // actually reaches duration, never on wall-clock alone.
      const pos = this.getCurrentPosition();
      if (pos >= this.cachedDuration - 0.05 && this.cachedDuration > 0) {
        this.offsetAtStart = 0;
        this.rafId = null;
        this.setStatus("paused");
        this.emit("timeupdate", this.cachedDuration);
        this.emit("ended", undefined);
        return;
      }
      this.emit("timeupdate", pos);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafId != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  private setStatus(s: EngineStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit("statuschange", s);
  }

  private emit<K extends keyof EventMap>(event: K, arg: EventMap[K]): void {
    const set = this.listeners[event] as Set<Listener<EventMap[K]>> | undefined;
    if (!set) return;
    for (const cb of set) cb(arg);
  }
}

export const audioEngine = new AudioEngine();
export type AudioEngineApi = AudioEngine;
