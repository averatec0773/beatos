import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/assets", () => ({
  assets: { listForTrack: vi.fn() },
}));

// Mock audio-engine: emit statuschange/timeupdate/durationchange via the
// subscribed callbacks so the store can react like in production. play() /
// load() / pause() / stop() trigger the same statuschange transitions the
// real Tone-backed engine would.
vi.mock("@/lib/audio-engine", () => {
  const listeners: Record<string, Array<(arg: unknown) => void>> = {};
  function emit(event: string, arg: unknown): void {
    (listeners[event] ?? []).forEach((cb) => cb(arg));
  }
  return {
    audioEngine: {
      on: (event: string, cb: (arg: unknown) => void) => {
        (listeners[event] ??= []).push(cb);
        return () => {
          listeners[event] = (listeners[event] ?? []).filter((c) => c !== cb);
        };
      },
      load: vi.fn(async () => {
        emit("statuschange", "loading");
        emit("statuschange", "paused");
      }),
      play: vi.fn(async () => {
        emit("statuschange", "playing");
      }),
      pause: vi.fn(() => {
        emit("statuschange", "paused");
      }),
      stop: vi.fn(() => {
        emit("statuschange", "idle");
        emit("timeupdate", 0);
      }),
      seek: vi.fn((p: number) => {
        emit("timeupdate", p);
      }),
      setVolume: vi.fn(),
      setMuted: vi.fn(),
      setForceMuted: vi.fn(),
      setBpm: vi.fn(),
      getBpm: vi.fn(() => 120),
      getStatus: vi.fn(() => "idle"),
      getDuration: vi.fn(() => 0),
      getCurrentPosition: vi.fn(() => 0),
      getCurrentAssetId: vi.fn(() => null),
      dispose: vi.fn(),
    },
  };
});

import { usePlayerStore } from "../player";
import { assets as assetsApi } from "@/api/assets";

function resetStore() {
  usePlayerStore.setState({
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
    queueOrigin: null,
  });
}

beforeEach(() => {
  resetStore();
  vi.mocked(assetsApi.listForTrack).mockReset();
});

describe("usePlayerStore defaults", () => {
  it("starts idle with no track", () => {
    const s = usePlayerStore.getState();
    expect(s.status).toBe("idle");
    expect(s.currentTrackId).toBeNull();
  });
});

describe("cycleRepeat", () => {
  it("cycles off -> all -> one -> off", () => {
    const { cycleRepeat } = usePlayerStore.getState();
    cycleRepeat();
    expect(usePlayerStore.getState().repeat).toBe("all");
    cycleRepeat();
    expect(usePlayerStore.getState().repeat).toBe("one");
    cycleRepeat();
    expect(usePlayerStore.getState().repeat).toBe("off");
  });
});

describe("toggleMute", () => {
  it("flips muted", () => {
    const { toggleMute } = usePlayerStore.getState();
    toggleMute();
    expect(usePlayerStore.getState().muted).toBe(true);
    toggleMute();
    expect(usePlayerStore.getState().muted).toBe(false);
  });
});

describe("setVolume", () => {
  it("clamps to 0..1", () => {
    const { setVolume } = usePlayerStore.getState();
    setVolume(1.5);
    expect(usePlayerStore.getState().volume).toBe(1);
    setVolume(-0.5);
    expect(usePlayerStore.getState().volume).toBe(0);
    setVolume(0.7);
    expect(usePlayerStore.getState().volume).toBeCloseTo(0.7);
  });
});

describe("toggleShuffle", () => {
  it("generates queueShuffleOrder when turned on", () => {
    usePlayerStore.setState({ queueTrackIds: [10, 20, 30], queueIndex: 1 });
    usePlayerStore.getState().toggleShuffle();
    const s = usePlayerStore.getState();
    expect(s.shuffle).toBe(true);
    expect(s.queueShuffleOrder).not.toBeNull();
    expect(s.queueShuffleOrder!.length).toBe(3);
    expect([...s.queueShuffleOrder!].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(s.queueShuffleOrder![0]).toBe(1);
  });

  it("clears queueShuffleOrder when turned off", () => {
    usePlayerStore.setState({
      shuffle: true,
      queueShuffleOrder: [2, 0, 1],
    });
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().shuffle).toBe(false);
    expect(usePlayerStore.getState().queueShuffleOrder).toBeNull();
  });
});

const mockAsset = (id: number, role: string, format = "") => ({
  id,
  role,
  format,
  missing: false,
  track_id: 0,
  abs_path: "/x",
  mime_type: null,
  mode: "linked" as const,
  rel_path: null,
  sha256: null,
  size_bytes: null,
  created_at: "",
});

describe("playFromQueue", () => {
  it("resolves audio asset and sets currentTrackId/Role", async () => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValueOnce([
      mockAsset(10, "audio_tagged", "wav"),
      mockAsset(11, "audio_tagged", "mp3"),
    ]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [1, 2, 3],
      startIndex: 1,
      origin: { kind: "all" },
    });
    const s = usePlayerStore.getState();
    expect(s.currentTrackId).toBe(2);
    expect(s.currentAssetId).toBe(10);
    expect(s.currentRole).toBe("audio_tagged:wav");
    expect(s.queueIndex).toBe(1);
    expect(s.status).toBe("playing");
  });

  it("sets status='error' when no audio asset resolvable", async () => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValueOnce([mockAsset(20, "cover")]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [5],
      startIndex: 0,
      origin: { kind: "all" },
    });
    expect(usePlayerStore.getState().status).toBe("error");
  });
});

describe("next/prev with repeat", () => {
  beforeEach(() => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValue([mockAsset(10, "audio_tagged", "wav")]);
  });

  it("next advances queueIndex", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2, 3],
      queueIndex: 0,
      currentTrackId: 1,
      status: "playing",
    });
    await usePlayerStore.getState().next();
    expect(usePlayerStore.getState().queueIndex).toBe(1);
    expect(usePlayerStore.getState().currentTrackId).toBe(2);
  });

  it("next at end with repeat=off stops", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2],
      queueIndex: 1,
      currentTrackId: 2,
      repeat: "off",
    });
    await usePlayerStore.getState().next();
    expect(usePlayerStore.getState().status).toBe("paused");
    expect(usePlayerStore.getState().queueIndex).toBe(1);
  });

  it("next at end with repeat=all wraps", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2],
      queueIndex: 1,
      currentTrackId: 2,
      repeat: "all",
    });
    await usePlayerStore.getState().next();
    expect(usePlayerStore.getState().queueIndex).toBe(0);
    expect(usePlayerStore.getState().currentTrackId).toBe(1);
  });

  it("prev wraps to start when at index 0 with repeat=off", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2],
      queueIndex: 0,
      currentTrackId: 1,
      repeat: "off",
    });
    await usePlayerStore.getState().prev();
    expect(usePlayerStore.getState().queueIndex).toBe(0);
  });

  it("next({wrap:true}) at end wraps to first even with repeat=off (manual button)", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2],
      queueIndex: 1,
      currentTrackId: 2,
      repeat: "off",
    });
    await usePlayerStore.getState().next({ wrap: true });
    expect(usePlayerStore.getState().queueIndex).toBe(0);
    expect(usePlayerStore.getState().currentTrackId).toBe(1);
  });

  it("prev({wrap:true}) at first wraps to last even with repeat=off (manual button)", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2],
      queueIndex: 0,
      currentTrackId: 1,
      repeat: "off",
      position: 0,
    });
    await usePlayerStore.getState().prev({ wrap: true });
    expect(usePlayerStore.getState().queueIndex).toBe(1);
    expect(usePlayerStore.getState().currentTrackId).toBe(2);
  });

  it("_onEnded at end with repeat=off still stops (auto-advance does not wrap)", async () => {
    usePlayerStore.setState({
      queueTrackIds: [1, 2],
      queueIndex: 1,
      currentTrackId: 2,
      repeat: "off",
    });
    await usePlayerStore.getState()._onEnded();
    expect(usePlayerStore.getState().status).toBe("paused");
    expect(usePlayerStore.getState().queueIndex).toBe(1);
  });
});

describe("togglePlay recovery", () => {
  it("retries loadAndPlay when status='error' with currentTrackId set", async () => {
    // First attempt fails (no audio asset resolvable)
    vi.mocked(assetsApi.listForTrack).mockResolvedValueOnce([mockAsset(99, "cover")]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [5],
      startIndex: 0,
      origin: { kind: "all" },
    });
    expect(usePlayerStore.getState().status).toBe("error");

    // Now an audio asset is available — togglePlay should retry
    vi.mocked(assetsApi.listForTrack).mockResolvedValueOnce([mockAsset(10, "audio_tagged", "wav")]);
    usePlayerStore.getState().togglePlay();
    // wait microtask for the async loadAndPlay to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlayerStore.getState().status).toBe("playing");
    expect(usePlayerStore.getState().currentAssetId).toBe(10);
  });

  it("retries loadAndPlay when status='idle' with currentTrackId set", async () => {
    usePlayerStore.setState({
      currentTrackId: 7,
      currentAssetId: null,
      currentRole: null,
      status: "idle",
    });
    vi.mocked(assetsApi.listForTrack).mockResolvedValueOnce([mockAsset(20, "audio_tagged", "wav")]);
    usePlayerStore.getState().togglePlay();
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlayerStore.getState().status).toBe("playing");
  });

  it("no-op when status='error' but no currentTrackId", () => {
    usePlayerStore.setState({ status: "error", currentTrackId: null });
    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().status).toBe("error");
  });
});

describe("concurrent loadAndPlay (rapid track switch)", () => {
  it("latest call wins — a slow earlier resolve must not clobber the newer track", async () => {
    let resolveA!: (v: unknown) => void;
    const aPending = new Promise((r) => {
      resolveA = r as (v: unknown) => void;
    });
    vi.mocked(assetsApi.listForTrack)
      .mockImplementationOnce(() => aPending as Promise<never>) // track 1: slow
      .mockResolvedValueOnce([mockAsset(20, "audio_tagged", "wav")]); // track 2: fast

    // Fire two switches back-to-back; the second (track 2) is the user's latest intent.
    const pA = usePlayerStore.getState().playFromQueue({
      trackIds: [1],
      startIndex: 0,
      origin: { kind: "all" },
    });
    const pB = usePlayerStore.getState().playFromQueue({
      trackIds: [2],
      startIndex: 0,
      origin: { kind: "all" },
    });
    await pB;
    // Now the stale earlier request resolves — it must NOT win.
    resolveA([mockAsset(10, "audio_tagged", "wav")]);
    await pA;

    expect(usePlayerStore.getState().currentTrackId).toBe(2);
    expect(usePlayerStore.getState().currentAssetId).toBe(20);
  });
});

describe("setPreferredRole", () => {
  it("re-resolves asset if preferred role is available", async () => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValue([
      mockAsset(10, "audio_tagged", "wav"),
      mockAsset(11, "audio_tagged", "mp3"),
    ]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [1],
      startIndex: 0,
      origin: { kind: "all" },
    });
    expect(usePlayerStore.getState().currentAssetId).toBe(10);
    await usePlayerStore.getState().setPreferredRole("audio_tagged:mp3");
    expect(usePlayerStore.getState().currentAssetId).toBe(11);
    expect(usePlayerStore.getState().currentRole).toBe("audio_tagged:mp3");
    expect(usePlayerStore.getState().position).toBe(0);
  });
});
