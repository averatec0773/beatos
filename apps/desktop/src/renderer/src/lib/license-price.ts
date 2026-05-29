/**
 * Shared license-tier price helpers — the constants and pure functions that the
 * per-track editor (`LicenseTiersSection`) and the settings template editor
 * (`DefaultLicenseTiersSection`) had byte-for-byte duplicated. Single source of
 * truth so the two stay in sync (audit C1/C6).
 */
import { fxConvertedString, SUPPORTED_CURRENCIES } from "@/lib/fx-rates";

/**
 * Fixed preset slots — always rendered, even when no row exists yet. The slot
 * key matches the deliverable token stored in the DB (lowercased).
 */
export const PRESET_SLOTS = [
  { key: "mp3", label: "MP3" },
  { key: "wav", label: "WAV" },
  { key: "stem", label: "STEMS" },
] as const;
export type PresetKey = (typeof PRESET_SLOTS)[number]["key"];
export const PRESET_KEYS = new Set<string>(PRESET_SLOTS.map((p) => p.key));

/** The two currencies that always have a fixed input slot. */
export const FIXED_CURRENCIES = ["CNY", "USD"] as const;
export const FIXED_CURRENCY_SET = new Set<string>(FIXED_CURRENCIES);
/** Currencies available in the optional third-slot dropdown. */
export const OTHER_CURRENCIES = SUPPORTED_CURRENCIES.filter((c) => !FIXED_CURRENCY_SET.has(c));

/** Shared label-column width for the price input rows. */
export const LABEL_WIDTH = "w-[100px]";

/**
 * Collapse per-currency string inputs into a numeric prices map. Empty / blank
 * inputs are dropped; negatives and non-finite values are ignored. Only the two
 * fixed currencies plus the selected `otherCurrency` are considered.
 */
export function inputsToPrices(
  inputs: Record<string, string>,
  otherCurrency: string | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of FIXED_CURRENCIES) {
    const v = inputs[code]?.trim() ?? "";
    if (v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[code] = n;
  }
  if (otherCurrency) {
    const v = inputs[otherCurrency]?.trim() ?? "";
    if (v !== "") {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[otherCurrency] = n;
    }
  }
  return out;
}

/**
 * Pick the first positive-priced currency (fixed first, then the third slot) to
 * drive the FX placeholder hints on the other inputs. Returns [code, amount].
 */
export function pickFxSource(
  priceInputs: Record<string, string>,
  otherCurrency: string | null,
): [string, number] | null {
  const order = [...FIXED_CURRENCIES, ...(otherCurrency ? [otherCurrency] : [])];
  for (const code of order) {
    const raw = priceInputs[code]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return [code, n];
  }
  return null;
}

/** FX-converted placeholder for `target`, derived from the picked `source`. */
export function fxPlaceholderFor(target: string, source: [string, number] | null): string {
  if (!source) return "—";
  const [from, amount] = source;
  if (from === target) return "—";
  // Bare numeric — the grayed placeholder color already signals "this is a
  // hint, not committed." An "≈ " prefix would push 4-digit conversions past
  // the 80px input's text capacity and clip the rightmost digit.
  const hint = fxConvertedString(amount, from, target);
  return hint || "—";
}
