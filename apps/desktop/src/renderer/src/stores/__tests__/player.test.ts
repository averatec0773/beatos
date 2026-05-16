import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/assets", () => ({
  assets: { listForTrack: vi.fn() },
}));

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
    queueSource: null,
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
    expect(new Set(s.queueShuffleOrder!)).toEqual(new Set([0, 1, 2]));
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

const mockAsset = (id: number, role: string) => ({
  id,
  role,
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
      mockAsset(10, "audio_tagged_wav"),
      mockAsset(11, "audio_tagged_mp3"),
    ]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [1, 2, 3],
      startIndex: 1,
      source: { kind: "all" },
    });
    const s = usePlayerStore.getState();
    expect(s.currentTrackId).toBe(2);
    expect(s.currentAssetId).toBe(10);
    expect(s.currentRole).toBe("audio_tagged_wav");
    expect(s.queueIndex).toBe(1);
    expect(s.status).toBe("playing");
  });

  it("sets status='error' when no audio asset resolvable", async () => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValueOnce([
      mockAsset(20, "cover"),
    ]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [5],
      startIndex: 0,
      source: { kind: "all" },
    });
    expect(usePlayerStore.getState().status).toBe("error");
  });
});

describe("next/prev with repeat", () => {
  beforeEach(() => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValue([
      mockAsset(10, "audio_tagged_wav"),
    ]);
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
});

describe("setPreferredRole", () => {
  it("re-resolves asset if preferred role is available", async () => {
    vi.mocked(assetsApi.listForTrack).mockResolvedValue([
      mockAsset(10, "audio_tagged_wav"),
      mockAsset(11, "audio_tagged_mp3"),
    ]);
    await usePlayerStore.getState().playFromQueue({
      trackIds: [1],
      startIndex: 0,
      source: { kind: "all" },
    });
    expect(usePlayerStore.getState().currentAssetId).toBe(10);
    await usePlayerStore.getState().setPreferredRole("audio_tagged_mp3");
    expect(usePlayerStore.getState().currentAssetId).toBe(11);
    expect(usePlayerStore.getState().currentRole).toBe("audio_tagged_mp3");
    expect(usePlayerStore.getState().position).toBe(0);
  });
});
