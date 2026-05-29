import { BEATOS_GENRES } from "./genres";
import { BEATOS_MOODS } from "./moods";

export type VocabLocale = "both" | "zh" | "en";
export type VocabKind = "genre" | "mood";

interface VocabEntry {
  zh: string | null;
  en: string;
}

// Reverse lookup by canonical English value. Built once at module load.
const GENRE_BY_EN = new Map<string, VocabEntry>(
  BEATOS_GENRES.map((g) => [g.en, { zh: g.zh, en: g.en }]),
);
const MOOD_BY_EN = new Map<string, VocabEntry>(
  BEATOS_MOODS.map((m) => [m.en, { zh: m.zh, en: m.en }]),
);

/**
 * Resolve the display string for a canonical English genre/mood value under
 * the given locale. Unknown values (legacy / custom) are returned unchanged.
 * `zh` locale and `both` locale both fall back to English when no Chinese
 * translation exists (e.g. genre "Boom Bap" has zh === null).
 */
export function formatVocabLabel(value: string, kind: VocabKind, locale: VocabLocale): string {
  const entry = (kind === "genre" ? GENRE_BY_EN : MOOD_BY_EN).get(value);
  if (!entry) return value;
  const { zh, en } = entry;
  if (locale === "en") return en;
  if (locale === "zh") return zh ?? en;
  // both
  return zh ? `${zh} (${en})` : en;
}
