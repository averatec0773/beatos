import { describe, it, expect } from "vitest";
import { resolveAudioAsset, availableAudioRoles } from "../audio-resolve";

const mkAsset = (id: number, role: string, missing = false) =>
  ({ id, role, missing, track_id: 1, abs_path: "/x", mime_type: null } as any);

describe("resolveAudioAsset", () => {
  it("returns null when no audio assets", () => {
    expect(resolveAudioAsset([mkAsset(1, "cover")])).toBeNull();
  });

  it("follows priority tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3", () => {
    const a = [
      mkAsset(1, "audio_untagged_mp3"),
      mkAsset(2, "audio_tagged_mp3"),
      mkAsset(3, "audio_untagged_wav"),
      mkAsset(4, "audio_tagged_wav"),
    ];
    expect(resolveAudioAsset(a)?.id).toBe(4);
  });

  it("falls back when higher-priority role is missing", () => {
    const a = [
      mkAsset(1, "audio_untagged_mp3"),
      mkAsset(2, "audio_tagged_wav", true),
    ];
    expect(resolveAudioAsset(a)?.id).toBe(1);
  });

  it("honors preferred role when present", () => {
    const a = [
      mkAsset(1, "audio_tagged_wav"),
      mkAsset(2, "audio_tagged_mp3"),
    ];
    expect(resolveAudioAsset(a, "audio_tagged_mp3")?.id).toBe(2);
  });

  it("falls back to priority when preferred role missing", () => {
    const a = [mkAsset(1, "audio_tagged_wav")];
    expect(resolveAudioAsset(a, "audio_untagged_mp3")?.id).toBe(1);
  });
});

describe("availableAudioRoles", () => {
  it("returns roles in priority order", () => {
    const a = [
      mkAsset(1, "audio_untagged_mp3"),
      mkAsset(2, "audio_tagged_wav"),
    ];
    expect(availableAudioRoles(a)).toEqual([
      "audio_tagged_wav",
      "audio_untagged_mp3",
    ]);
  });

  it("excludes missing assets", () => {
    const a = [mkAsset(1, "audio_tagged_wav", true)];
    expect(availableAudioRoles(a)).toEqual([]);
  });
});
