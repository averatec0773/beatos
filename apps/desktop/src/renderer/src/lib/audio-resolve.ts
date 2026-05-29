import type { Asset } from "@/api/assets";

export type AudioRole =
  | "audio_tagged_wav"
  | "audio_untagged_wav"
  | "audio_tagged_mp3"
  | "audio_untagged_mp3";

export const AUDIO_ROLES: readonly AudioRole[] = [
  "audio_tagged_wav",
  "audio_untagged_wav",
  "audio_tagged_mp3",
  "audio_untagged_mp3",
] as const;

export const AUDIO_ROLE_LABEL: Record<AudioRole, string> = {
  audio_tagged_wav: "WAV (tagged)",
  audio_untagged_wav: "WAV (untagged)",
  audio_tagged_mp3: "MP3 (tagged)",
  audio_untagged_mp3: "MP3 (untagged)",
};

export function resolveAudioAsset(assets: Asset[], preferred?: AudioRole | null): Asset | null {
  if (preferred) {
    const direct = assets.find((a) => a.role === preferred && !a.missing);
    if (direct) return direct;
  }
  for (const role of AUDIO_ROLES) {
    const a = assets.find((x) => x.role === role && !x.missing);
    if (a) return a;
  }
  return null;
}

export function availableAudioRoles(assets: Asset[]): AudioRole[] {
  return AUDIO_ROLES.filter((r) => assets.some((a) => a.role === r && !a.missing));
}
