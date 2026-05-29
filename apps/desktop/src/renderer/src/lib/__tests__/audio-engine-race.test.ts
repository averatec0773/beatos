/**
 * Race-condition coverage for the audio engine: a concurrent load() can dispose
 * the player while play() is parked on `await Tone.start()`. play() must not
 * dereference a null player when it resumes. Uses a controllable Tone mock so
 * the AudioContext reports non-running (forcing the await) and Tone.start() can
 * be resolved on demand mid-flight.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

let ctxState = "suspended";
let resolveStart: (() => void) | null = null;

vi.mock("tone", () => {
  const transport = { bpm: { value: 120 } };
  return {
    Player: class {
      volume = { value: 0 };
      mute = false;
      toDestination(): this {
        return this;
      }
      start(): void {}
      stop(): void {}
      dispose(): void {}
    },
    ToneAudioBuffer: class {
      duration = 1;
      async load(): Promise<this> {
        return this;
      }
      get(): { numberOfChannels: number; length: number } {
        return { numberOfChannels: 1, length: 44100 };
      }
      dispose(): void {}
    },
    getContext: () => ({ state: ctxState }),
    getTransport: () => transport,
    start: () =>
      new Promise<void>((r) => {
        resolveStart = r;
      }),
    now: () => 0,
    gainToDb: (v: number) => 20 * Math.log10(Math.max(v, 1e-6)),
  };
});

import { audioEngine } from "../audio-engine";

beforeEach(() => {
  audioEngine.dispose();
  ctxState = "suspended";
  resolveStart = null;
});

describe("audio-engine concurrent load/play race", () => {
  it("play() does not throw if the player is disposed during await Tone.start()", async () => {
    await audioEngine.load(1);

    // play() enters, sees context not running, parks on `await Tone.start()`.
    const playPromise = audioEngine.play();
    await Promise.resolve(); // let play() reach the await

    // A concurrent load() (rapid track switch) disposes the current player.
    audioEngine.dispose();

    // AudioContext resumes — play() continues past the await with player === null.
    resolveStart?.();

    await expect(playPromise).resolves.toBeUndefined();
  });
});
