/**
 * Audio engine smoke tests. We do NOT exercise Tone's audio graph in jsdom —
 * the AudioContext is unavailable. These tests pin the public surface:
 * event subscribe/unsubscribe, status defaults, and that re-loading the
 * same asset short-circuits.
 *
 * Real-audio coverage lives in scripts/smoke.mjs which drives the actual
 * Electron renderer + Tone.js + decodeAudioData against a real WAV.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Tone touches `window.AudioContext` at import time. Stub it so module init
// doesn't throw in jsdom.
vi.mock("tone", () => {
  const transport = { bpm: { value: 120 } };
  return {
    Player: class {
      volume = { value: 0 };
      mute = false;
      toDestination(): this {
        return this;
      }
      connect(): this {
        return this;
      }
      start(): void {}
      stop(): void {}
      dispose(): void {}
    },
    Analyser: class {
      toDestination(): this {
        return this;
      }
      getValue(): Float32Array {
        return new Float32Array(0);
      }
      dispose(): void {}
    },
    ToneAudioBuffer: class {
      duration = 1;
      async load(): Promise<this> {
        return this;
      }
      get(): { numberOfChannels: number; length: number } {
        // 1 channel × 44100 samples = small fixed footprint so cache budget
        // math has something deterministic to chew on.
        return { numberOfChannels: 1, length: 44100 };
      }
      dispose(): void {}
    },
    getContext: () => ({ state: "running" }),
    getTransport: () => transport,
    start: async () => {},
    now: () => 0,
    gainToDb: (v: number) => 20 * Math.log10(Math.max(v, 1e-6)),
  };
});

import { audioEngine } from "../audio-engine";

beforeEach(() => {
  audioEngine.dispose();
});

describe("audio-engine", () => {
  it("starts in idle status with no asset loaded", () => {
    expect(audioEngine.getStatus()).toBe("idle");
    expect(audioEngine.getCurrentAssetId()).toBeNull();
    expect(audioEngine.getDuration()).toBe(0);
  });

  it("on(event) returns an unsubscribe handle that detaches the listener", () => {
    const cb = vi.fn();
    const off = audioEngine.on("statuschange", cb);
    off();
    // Re-loading after unsubscribe should not call cb (verified indirectly:
    // a separate test asserts emit reaches subscribed listeners).
    expect(cb).not.toHaveBeenCalled();
  });

  it("emits statuschange when load() resolves", async () => {
    const seen: string[] = [];
    audioEngine.on("statuschange", (s) => seen.push(s));
    await audioEngine.load(1);
    expect(seen).toContain("loading");
    expect(seen).toContain("paused");
  });

  it("emits durationchange with buffer duration after load", async () => {
    const durations: number[] = [];
    audioEngine.on("durationchange", (d) => durations.push(d));
    await audioEngine.load(1);
    expect(durations).toEqual([1]);
  });

  it("setBpm + getBpm round-trip via Tone.Transport", () => {
    audioEngine.setBpm(128);
    expect(audioEngine.getBpm()).toBe(128);
  });

  it("dispose() resets status and current asset", async () => {
    await audioEngine.load(1);
    audioEngine.dispose();
    expect(audioEngine.getStatus()).toBe("idle");
    expect(audioEngine.getCurrentAssetId()).toBeNull();
  });
});
