import { appSettings } from "@/api/app-settings";
import { distinct } from "@/api/distinct";

/**
 * Producer-name management.
 *
 * Producers exist in two places:
 *   1. As distinct values of `track.producer` (anything attached to a track)
 *   2. As an explicit name list under app_setting key `known_producers`
 *      (lets the user pre-register names from Settings before a track uses
 *      them — orphan-tolerant)
 *
 * The TrackEditor dropdown and the Settings list both render the *union*
 * so a producer name surfaces immediately after the user adds it, even if
 * no track carries it yet.
 *
 * Case policy: this layer preserves whatever case the caller passes. The
 * v0.0.27.0 dogfood bug (`AVERATEC` vs `averatec` coexisting from MCP
 * imports) is tracked in ROADMAP as a separate canonicalization story —
 * deliberately not papered over here so the duplicates remain visible.
 */

export const KNOWN_PRODUCERS_KEY = "known_producers";

export async function loadKnownProducers(): Promise<string[]> {
  try {
    const r = await appSettings.get<string[]>(KNOWN_PRODUCERS_KEY);
    return Array.isArray(r.value) ? r.value : [];
  } catch (e) {
    console.warn("[known-producers] load failed:", e);
    return [];
  }
}

async function saveKnownProducers(names: string[]): Promise<void> {
  await appSettings.set(KNOWN_PRODUCERS_KEY, names);
}

export async function addKnownProducer(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = await loadKnownProducers();
  if (current.includes(trimmed)) return;
  await saveKnownProducers([...current, trimmed]);
}

export async function removeKnownProducer(name: string): Promise<void> {
  const current = await loadKnownProducers();
  if (!current.includes(name)) return;
  await saveKnownProducers(current.filter((n) => n !== name));
}

/** Union of (distinct producers used on tracks) ∪ (known_producers
 *  registered in Settings). Preserves whichever order the caller cares
 *  about — distinct values first (sorted by usage by the API), then
 *  known-only orphans in insertion order. */
export async function loadAllProducerNames(): Promise<{
  used: string[];
  knownOnly: string[];
  all: string[];
}> {
  const [used, known] = await Promise.all([distinct.values("producer"), loadKnownProducers()]);
  const usedSet = new Set(used);
  const knownOnly = known.filter((n) => !usedSet.has(n));
  return { used, knownOnly, all: [...used, ...knownOnly] };
}
