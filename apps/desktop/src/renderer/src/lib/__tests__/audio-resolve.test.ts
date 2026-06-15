import { describe, it, expect } from "vitest";
import { resolveAudioAsset, availableVariants, variantKey } from "../audio-resolve";

const mkAsset = (id: number, role: string, format: string, missing = false) =>
  ({ id, role, format, missing, track_id: 1, abs_path: "/x", mime_type: null }) as any;

describe("resolveAudioAsset", () => {
  it("returns null when no audio assets", () => {
    expect(resolveAudioAsset([mkAsset(1, "cover", "")])).toBeNull();
  });

  it("follows priority: wav before mp3, tagged before untagged within a format", () => {
    const a = [
      mkAsset(1, "audio_untagged", "mp3"),
      mkAsset(2, "audio_tagged", "mp3"),
      mkAsset(3, "audio_untagged", "wav"),
      mkAsset(4, "audio_tagged", "wav"),
    ];
    expect(resolveAudioAsset(a)?.id).toBe(4); // tagged wav wins
  });

  it("ranks flac between wav and mp3", () => {
    const a = [mkAsset(1, "audio_untagged", "mp3"), mkAsset(2, "audio_untagged", "flac")];
    expect(resolveAudioAsset(a)?.id).toBe(2);
  });

  it("falls back when the higher-priority variant is missing", () => {
    const a = [mkAsset(1, "audio_untagged", "mp3"), mkAsset(2, "audio_tagged", "wav", true)];
    expect(resolveAudioAsset(a)?.id).toBe(1);
  });

  it("honors a preferred variant key when present", () => {
    const a = [mkAsset(1, "audio_tagged", "wav"), mkAsset(2, "audio_tagged", "mp3")];
    expect(resolveAudioAsset(a, "audio_tagged:mp3")?.id).toBe(2);
  });

  it("falls back to priority when the preferred variant is missing", () => {
    const a = [mkAsset(1, "audio_tagged", "wav")];
    expect(resolveAudioAsset(a, "audio_untagged:mp3")?.id).toBe(1);
  });
});

describe("availableVariants", () => {
  it("returns variants in priority order with keys + labels", () => {
    const a = [mkAsset(1, "audio_untagged", "mp3"), mkAsset(2, "audio_tagged", "wav")];
    expect(availableVariants(a).map((v) => v.key)).toEqual([
      "audio_tagged:wav",
      "audio_untagged:mp3",
    ]);
    expect(availableVariants(a)[0].label).toBe("WAV (tagged)");
  });

  it("excludes missing assets", () => {
    const a = [mkAsset(1, "audio_tagged", "wav", true)];
    expect(availableVariants(a)).toEqual([]);
  });

  it("keys loop without a format dimension", () => {
    expect(variantKey("loop", "")).toBe("loop");
  });
});
