import type { Asset } from "@/api/assets";

// Audio format is decoupled from the DB role (v0.0.49): a playable "variant" is a
// (role, format) pair. The renderer keys variants on a composite string so the
// player / RoleSwitcher can still treat a variant as a single switchable unit.
// `loop` has no format dimension in the UI, so its key is just "loop".
export type VariantKey = string;

// Play-priority, preserved from the pre-decouple order: format wav > flac > mp3,
// and within a format tagged > untagged; loop is the last-resort fallback.
const FORMAT_RANK: Record<string, number> = { wav: 0, flac: 1, mp3: 2 };
const TAG_RANK: Record<string, number> = { audio_tagged: 0, audio_untagged: 1 };

function isAudio(a: Asset): boolean {
  return a.role === "loop" || a.role in TAG_RANK;
}

function rank(a: Asset): number {
  if (a.role === "loop") return 900;
  const f = FORMAT_RANK[a.format] ?? 8;
  const t = TAG_RANK[a.role] ?? 8;
  return f * 2 + t;
}

export function variantKey(role: string, format: string): VariantKey {
  return role === "loop" || !format ? role : `${role}:${format}`;
}

export function variantLabel(role: string, format: string): string {
  if (role === "loop") return "Loop";
  const tag = role === "audio_tagged" ? "tagged" : "untagged";
  return format ? `${format.toUpperCase()} (${tag})` : tag;
}

export interface AudioVariant {
  key: VariantKey;
  role: string;
  format: string;
  label: string;
}

/**
 * Resolve a track's playable audio asset. `preferred` is a variant key
 * (role:format); if it isn't present (e.g. a stale persisted preference from
 * before the format decouple), fall back to the priority order.
 */
export function resolveAudioAsset(assets: Asset[], preferred?: VariantKey | null): Asset | null {
  const audio = assets.filter((a) => !a.missing && isAudio(a));
  if (preferred) {
    const direct = audio.find((a) => variantKey(a.role, a.format) === preferred);
    if (direct) return direct;
  }
  return audio.slice().sort((x, y) => rank(x) - rank(y))[0] ?? null;
}

/** Available playable variants for a track, in play-priority order. */
export function availableVariants(assets: Asset[]): AudioVariant[] {
  return assets
    .filter((a) => !a.missing && isAudio(a))
    .slice()
    .sort((x, y) => rank(x) - rank(y))
    .map((a) => ({
      key: variantKey(a.role, a.format),
      role: a.role,
      format: a.format,
      label: variantLabel(a.role, a.format),
    }));
}
