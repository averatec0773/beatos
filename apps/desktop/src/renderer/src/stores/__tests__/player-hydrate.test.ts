import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory localStorage (jsdom's here lacks a usable clear()).
const backing: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = String(v);
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
  clear: () => {
    for (const k of Object.keys(backing)) delete backing[k];
  },
});

// Mock the engine + assets API before importing the store (which subscribes at
// module load). The store reads localStorage at create-time, so each test sets
// it up before the dynamic import.
const engine = {
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getCurrentPosition: vi.fn(() => 0),
  on: vi.fn(() => () => {}),
  load: vi.fn(async () => {}),
  seek: vi.fn(),
  play: vi.fn(async () => {}),
  pause: vi.fn(),
  stop: vi.fn(),
};
vi.mock("@/lib/audio-engine", () => ({ audioEngine: engine }));

const listForTrack = vi.fn();
vi.mock("@/api/assets", () => ({ assets: { listForTrack } }));

const STORAGE_KEY = "beatos.player.v1";

describe("player hydrate / persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("restores volume/mute and falls back to idle when the last track is gone", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: 0.4,
        muted: true,
        shuffle: false,
        repeat: "all",
        preferredRole: null,
        lastTrackId: 7,
        lastPosition: 12,
      }),
    );
    listForTrack.mockResolvedValue([]); // track/asset no longer exists

    const { usePlayerStore } = await import("@/stores/player");
    // Prefs restored immediately into initial state.
    expect(usePlayerStore.getState().volume).toBe(0.4);
    expect(usePlayerStore.getState().muted).toBe(true);
    expect(usePlayerStore.getState().repeat).toBe("all");

    await usePlayerStore.getState().hydrate();

    // Fallback: stays idle, no current track, engine never asked to load.
    expect(usePlayerStore.getState().currentTrackId).toBeNull();
    expect(usePlayerStore.getState().status).toBe("idle");
    expect(engine.load).not.toHaveBeenCalled();
    // Stale resume pointer cleared, prefs preserved.
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.lastTrackId).toBeNull();
    expect(persisted.volume).toBe(0.4);
  });

  function seedResume(lastTrackId: number, lastPosition = 0): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: 1,
        muted: false,
        shuffle: false,
        repeat: "off",
        preferredRole: null,
        lastTrackId,
        lastPosition,
      }),
    );
  }

  it("preserves the resume pointer when load() throws (transient boot failure)", async () => {
    // The regression: a one-off decode/fetch hiccup at boot used to wipe
    // lastTrackId, leaving the player permanently empty on every later launch.
    seedResume(24, 30);
    listForTrack.mockResolvedValue([
      { id: 99, role: "audio_tagged", format: "wav", missing: false },
    ]);
    engine.load.mockRejectedValueOnce(new Error("decode failed"));

    const { usePlayerStore } = await import("@/stores/player");
    await usePlayerStore.getState().hydrate();

    // Track stays selected + retriable; pointer is NOT destroyed.
    const s = usePlayerStore.getState();
    expect(s.currentTrackId).toBe(24);
    expect(s.status).toBe("error");
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.lastTrackId).toBe(24);
  });

  it("preserves the resume pointer when the audio is transiently missing (linked drive offline)", async () => {
    seedResume(24, 30);
    // Track row exists, but its only audio asset is flagged missing (external
    // file unavailable) → resolveAudioAsset yields nothing, yet the track is NOT
    // gone.
    listForTrack.mockResolvedValue([
      { id: 99, role: "audio_tagged", format: "wav", missing: true },
    ]);

    const { usePlayerStore } = await import("@/stores/player");
    await usePlayerStore.getState().hydrate();

    const s = usePlayerStore.getState();
    expect(s.currentTrackId).toBe(24);
    expect(s.status).toBe("error");
    expect(engine.load).not.toHaveBeenCalled();
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.lastTrackId).toBe(24);
  });

  it("migrates a pre-decouple preferredRole (underscore) to the new variant key", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: 1,
        muted: false,
        shuffle: false,
        repeat: "off",
        preferredRole: "audio_tagged_mp3", // legacy role_format form
        lastTrackId: null,
        lastPosition: 0,
      }),
    );

    const { usePlayerStore } = await import("@/stores/player");
    expect(usePlayerStore.getState().preferredRole).toBe("audio_tagged:mp3");
  });

  it("restores the track paused at the saved position on success", async () => {
    seedResume(24, 30);
    listForTrack.mockResolvedValue([
      { id: 99, role: "audio_tagged", format: "wav", missing: false },
    ]);

    const { usePlayerStore } = await import("@/stores/player");
    await usePlayerStore.getState().hydrate();

    const s = usePlayerStore.getState();
    expect(s.currentTrackId).toBe(24);
    expect(s.currentAssetId).toBe(99);
    expect(engine.load).toHaveBeenCalledWith(99);
    expect(engine.seek).toHaveBeenCalledWith(30);
    expect(s.position).toBe(30);
  });
});
