export const AUDIO_ROLES = [
  "audio_tagged_wav",
  "audio_untagged_wav",
  "audio_tagged_mp3",
  "audio_untagged_mp3",
  "loop",
] as const;

// Keep in sync with packages/beatos-core/beatos_core/audio_analysis/constants.py
// (server-side batch autofill uses the Python copy; both must change together).
export const BPM_AUTOFILL_THRESHOLD = 0.7;
export const KEY_AUTOFILL_THRESHOLD = 0.6;

export function isAudioRole(role: string): boolean {
  return (AUDIO_ROLES as readonly string[]).includes(role);
}
