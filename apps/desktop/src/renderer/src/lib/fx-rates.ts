/**
 * Currency conversion *reference* hints for the license editor.
 *
 * Producers usually quote one canonical price per tier, then mentally
 * cross-check what it looks like in other currencies (often rounding
 * after conversion). This module supplies a hardcoded mid-market snapshot
 * so the renderer can render `≈ $14 · €13` style hints next to the user's
 * primary number. NO network call — BeatOS is local-first and reference
 * accuracy here is "close enough to spot a typo," not bookkeeping-grade.
 *
 * Refresh discipline: bump `FX_SNAPSHOT_DATE` and the table when ranges
 * drift by >10% from real mid-market quotes. There's no auto-refresh; a
 * stale snapshot is preferable to a surprise network call.
 */

export const FX_SNAPSHOT_DATE = "2026-05";

// All rates expressed as "1 unit of X is worth this many USD". Cross-rates
// are derived (a→b = a→USD ÷ b→USD), so adding a new currency only requires
// one number here. USD itself is anchored to 1.0.
export const FX_RATES_TO_USD: Record<string, number> = {
  USD: 1.0,
  CNY: 0.139,
  EUR: 1.08,
  JPY: 0.0066,
  GBP: 1.27,
};

export const SUPPORTED_CURRENCIES = Object.keys(FX_RATES_TO_USD);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  JPY: "¥",     // intentionally the same glyph as CNY; disambiguate via code
  GBP: "£",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function convertFx(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  const fromRate = FX_RATES_TO_USD[from];
  const toRate = FX_RATES_TO_USD[to];
  if (fromRate == null || toRate == null) return null;
  return (amount * fromRate) / toRate;
}

/**
 * Pick up to 2 alternate currencies for hint display, prioritized by the
 * markets most beat producers actually quote in. The primary currency is
 * always excluded.
 */
const HINT_PRIORITY = ["USD", "CNY", "EUR", "GBP", "JPY"] as const;

export function pickHintCurrencies(primary: string, max = 2): string[] {
  const out: string[] = [];
  for (const c of HINT_PRIORITY) {
    if (c === primary) continue;
    if (FX_RATES_TO_USD[c] == null) continue;
    out.push(c);
    if (out.length === max) break;
  }
  return out;
}

function formatHintAmount(amount: number, currency: string): string {
  // JPY rounds to integer (smallest unit is whole yen). Everything else
  // shows up to 2 decimals but drops trailing zeros for short hints.
  if (currency === "JPY") return String(Math.round(amount));
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Build the gray hint string for a single tier. Returns `""` when the
 * hint cannot be computed (missing price, unknown currency, etc.) so the
 * caller can render nothing without conditional guards.
 */
export function buildFxHint(
  price: number | null,
  currency: string,
  alternates?: string[],
): string {
  if (price == null || !Number.isFinite(price)) return "";
  const targets = alternates ?? pickHintCurrencies(currency);
  const parts: string[] = [];
  for (const target of targets) {
    const converted = convertFx(price, currency, target);
    if (converted == null) continue;
    parts.push(`${currencySymbol(target)}${formatHintAmount(converted, target)}`);
  }
  if (parts.length === 0) return "";
  return `≈ ${parts.join(" · ")}`;
}
