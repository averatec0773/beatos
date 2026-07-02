import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/assets", async () => {
  const actual = await vi.importActual<typeof import("@/api/assets")>("@/api/assets");
  return {
    ...actual,
    assets: {
      ...actual.assets,
      listForTrack: vi.fn(),
    },
  };
});

import { useAssetStore } from "../assets";
import { assets as api, type Asset } from "@/api/assets";

const listForTrack = api.listForTrack as ReturnType<typeof vi.fn>;

function makeAsset(id: number): Asset {
  return {
    id,
    track_id: 1,
    role: "audio_tagged",
    mode: "managed",
    abs_path: `/x/${id}.mp3`,
    rel_path: null,
    sha256: null,
    size_bytes: null,
    mime_type: null,
    format: "mp3",
    missing: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("useAssetStore.ensureForTrack", () => {
  beforeEach(() => {
    listForTrack.mockReset();
    useAssetStore.setState({ byTrack: {}, version: 0 });
  });

  it("concurrent calls for the same id share a single request", async () => {
    let resolve!: (v: Asset[]) => void;
    listForTrack.mockReturnValueOnce(
      new Promise<Asset[]>((r) => {
        resolve = r;
      }),
    );

    const store = useAssetStore.getState();
    const p1 = store.ensureForTrack(1);
    const p2 = store.ensureForTrack(1);

    expect(p1).toBe(p2);
    expect(listForTrack).toHaveBeenCalledTimes(1);

    const list = [makeAsset(10)];
    resolve(list);
    await expect(p1).resolves.toEqual(list);
    await expect(p2).resolves.toEqual(list);
    // The result populates the store.
    expect(useAssetStore.getState().byTrack[1]).toEqual(list);
  });

  it("sequential calls after settle refetch fresh", async () => {
    listForTrack.mockResolvedValueOnce([makeAsset(10)]);
    await useAssetStore.getState().ensureForTrack(1);
    expect(listForTrack).toHaveBeenCalledTimes(1);

    // First request has settled and cleared the in-flight entry, so the next
    // call issues a new fetch rather than returning the stale promise.
    listForTrack.mockResolvedValueOnce([makeAsset(11)]);
    const list2 = await useAssetStore.getState().ensureForTrack(1);
    expect(listForTrack).toHaveBeenCalledTimes(2);
    expect(list2).toEqual([makeAsset(11)]);
    expect(useAssetStore.getState().byTrack[1]).toEqual([makeAsset(11)]);
  });

  it("a rejected fetch clears the in-flight entry so a retry refetches", async () => {
    listForTrack.mockRejectedValueOnce(new Error("boom"));
    await expect(useAssetStore.getState().ensureForTrack(1)).rejects.toThrow("boom");

    listForTrack.mockResolvedValueOnce([makeAsset(12)]);
    await expect(useAssetStore.getState().ensureForTrack(1)).resolves.toEqual([makeAsset(12)]);
    expect(listForTrack).toHaveBeenCalledTimes(2);
  });
});
